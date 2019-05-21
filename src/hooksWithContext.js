import React, { useEffect, useCallback, useContext } from 'react'
import { merge, mergeWith, map, includes } from 'lodash/fp'

import {
  useLocalStorageReducer,
  useSessionStorageState,
} from 'react-storage-hooks'

import {
  ShopifyProvider,
  useShopifyCheckout,
  useShopifyCustomer,
  useShopifyCustomerAccessToken,
  useShopifyProductVariant,
} from './hooks'

const initialState = {
  customerAccessToken: null,
  customerAccessTokenExpiresAt: null,
  checkoutId: null,
  checkoutLineItems: [],
}

const reducer = (state, action) => {
  const { type, payload } = action

  switch (type) {
    case 'SET_CUSTOMER_ACCESS_TOKEN':
      return {
        ...state,
        customerAccessToken: payload.accessToken,
        customerAccessTokenExpiresAt: payload.expiresAt,
      }

    case 'SET_CHECKOUT_ID':
      return {
        ...state,
        checkoutId: payload,
      }

    case 'SET_CHECKOUT_LINE_ITEMS':
      return {
        ...state,
        checkoutLineItems: payload,
      }

    case 'RESET':
      return initialState

    default:
      throw new Error('Invalid action type. Please use a supported action.')
  }
}

const PersistedReducerContext = React.createContext()

const InMemoryReducerContext = React.createContext()

const PersistedReducerProvider = ({ children, persist = true }) => {
  const hookedReducer = useLocalStorageReducer(
    'react-shopify-hooks',
    reducer,
    initialState
  )
  return (
    <PersistedReducerContext.Provider value={hookedReducer}>
      {children}
    </PersistedReducerContext.Provider>
  )
}

const InMemoryReducerProvider = ({ children }) => {
  const hookedReducer = useSessionStorageState('sessionIsNew', true)
  return (
    <InMemoryReducerContext.Provider value={hookedReducer}>
      {children}
    </InMemoryReducerContext.Provider>
  )
}

/***
 * ShopifyProviderWithContext
 *
 * Root context provider to allow Apollo to communicate with Shopify and store
 * global state.
 */
export const ShopifyProviderWithContext = ({ persist = true, ...props }) => (
  <InMemoryReducerProvider>
    <PersistedReducerProvider persist={persist}>
      <ShopifyProvider {...props} />
    </PersistedReducerProvider>
  </InMemoryReducerProvider>
)

/***
 * useShopifyPersistedReducer
 *
 * Returns the reducer used for managing persisted global state.
 */
export const useShopifyPersistedReducer = () =>
  useContext(PersistedReducerContext)

/***
 * useShopifyInMemoryReducer
 *
 * Returns the reducer used for managing in memory global state.
 */
export const useShopifyInMemoryReducer = () =>
  useContext(InMemoryReducerContext)

/***
 * useShopifyCustomerAccessTokenWithContext
 *
 * useShopifyCustomerAccessToken hooked up to global state. Customer access
 * tokens are stored in the global state to allow implicit access to the token
 * in other hooks.
 *
 * If autoRenew is true, this hook will automatically renew the token if the
 * saved token expires within 1 day.
 */
export const useShopifyCustomerAccessTokenWithContext = (autoRenew = true) => {
  const [
    { customerAccessToken, customerAccessTokenExpiresAt },
    dispatch,
  ] = useShopifyPersistedReducer()
  const useShopifyCustomerAccessTokenResult = useShopifyCustomerAccessToken(
    customerAccessToken
  )
  const {
    createCustomerAccessToken,
    renewCustomerAccessToken,
    deleteCustomerAccessToken,
  } = useShopifyCustomerAccessTokenResult

  // Renews and sets the global customer access token.

  const [sessionIsNew, setSessionIsNew] = useShopifyInMemoryReducer()

  const renewToken = useCallback(async () => {
    const result = await renewCustomerAccessToken(customerAccessToken)
    if (result.data) {
      const {
        data: { accessToken, expiresAt },
      } = result

      dispatch({
        type: 'SET_CUSTOMER_ACCESS_TOKEN',
        payload: { accessToken, expiresAt },
      })

      return result
    }

    await signOut()

    return result
  }, [customerAccessToken, dispatch, renewCustomerAccessToken, signOut])

  const signOut = useCallback(async () => {
    if (customerAccessToken) deleteCustomerAccessToken(customerAccessToken)
    dispatch({ type: 'RESET' })
    setSessionIsNew(true)
  }, [
    customerAccessToken,
    deleteCustomerAccessToken,
    dispatch,
    setSessionIsNew,
  ])

  // Renew access token automatically
  const renewTokenAutomatically = useCallback(async () => {
    await renewToken()
    setSessionIsNew(false)
    return
  }, [renewToken, setSessionIsNew])

  useEffect(() => {
    if (customerAccessToken && sessionIsNew) {
      renewTokenAutomatically()
    }
    return
  }, [customerAccessToken, renewTokenAutomatically, sessionIsNew])

  return merge(useShopifyCustomerAccessTokenResult, {
    customerAccessToken,
    isSignedIn: Boolean(customerAccessToken),
    actions: {
      // Creates and sets the global customer access token.
      signIn: async (...args) => {
        const result = await createCustomerAccessToken(...args)

        if (result.data) {
          const {
            data: { accessToken, expiresAt },
          } = result

          dispatch({
            type: 'SET_CUSTOMER_ACCESS_TOKEN',
            payload: { accessToken, expiresAt },
          })
          setSessionIsNew(false)
        }

        return result
      },

      // Renews and sets the global customer access token.
      renewToken,

      // Deletes the global customer access token and resets the global state.
      signOut,
    },
  })
}

/***
 * useShopifyCheckoutWithContext
 *
 * useShopifyCheckout hooked up to global state. A single checkout is stored
 * globally to allow implicit access to the checkout in other hooks.
 */
export const useShopifyCheckoutWithContext = (autoCreate = true) => {
  const [{ checkoutId }, dispatch] = useShopifyPersistedReducer()
  const useShopifyCheckoutResult = useShopifyCheckout(checkoutId)
  const {
    actions: { createCheckout },
  } = useShopifyCheckoutResult

  // Creates and sets a new global checkout.
  const createCheckoutWithContext = useCallback(
    async (...args) => {
      const result = await createCheckout(...args)

      if (result.data) {
        const {
          data: { id },
        } = result

        dispatch({ type: 'SET_CHECKOUT_ID', payload: id })
      }

      return result
    },
    [createCheckout, dispatch]
  )

  // If autoCreate is true, automatically create a new checkout if one is not
  // present.
  useEffect(() => {
    if (autoCreate && !checkoutId) createCheckoutWithContext()
  }, [autoCreate, checkoutId, createCheckoutWithContext])

  return merge(useShopifyCheckoutResult, {
    actions: {
      // Creates and sets a new global checkout.
      createCheckout: createCheckoutWithContext,
    },
  })
}

/***
 * useShopifyProductVariantWithContext
 *
 * useShopifyCheckout hooked up to global state. This provides convenient
 * global checkout-related functions.
 */
export const useShopifyProductVariantWithContext = variantId => {
  const [{ checkoutLineItems }, dispatch] = useShopifyPersistedReducer()
  const useShopifyProductVariantResult = useShopifyProductVariant(variantId)
  const {
    actions: { lineItemsReplace },
  } = useShopifyCheckoutWithContext()

  return merge(useShopifyProductVariantResult, {
    actions: {
      // Adds the product variant to the global checkout.
      addToCheckout: async (quantity = 1, customAttributes) => {
        const newLineItem = { variantId, quantity, customAttributes }

        let nextLineItems = null
        let duplicateResolved = false

        // Combine and add up the quantity for duplicate line items
        let mergedLineItems = map(lineItem => {
          if (includes(variantId, lineItem)) {
            duplicateResolved = true
            return mergeWith(
              (objValue, srcValue, key) => {
                if (key === 'quantity') {
                  return objValue + srcValue
                }
              },
              lineItem,
              newLineItem
            )
          } else {
            return lineItem
          }
        }, checkoutLineItems)

        if (duplicateResolved) {
          nextLineItems = mergedLineItems
        } else {
          nextLineItems = [newLineItem, ...mergedLineItems]
        }

        await lineItemsReplace(nextLineItems)

        dispatch({
          type: 'SET_CHECKOUT_LINE_ITEMS',
          payload: nextLineItems,
        })
      },
    },
  })
}

/***
 * useShopifyCustomerWithContext
 *
 * useShopifyCustomer hooked up to global state.
 */
export const useShopifyCustomerWithContext = () => {
  const [{ customerAccessToken }, dispatch] = useShopifyPersistedReducer()
  const useShopifyCustomerResult = useShopifyCustomer(customerAccessToken)
  const {
    actions: { activateCustomer, resetCustomer, resetCustomerByUrl },
  } = useShopifyCustomerResult

  return merge(useShopifyCustomerResult, {
    actions: {
      // Activates the customer and sets the global customer access token.
      activateCustomer: async (...args) => {
        const result = await activateCustomer(...args)

        if (result.data) {
          const {
            data: { accessToken, expiresAt },
          } = result

          dispatch({
            type: 'SET_CUSTOMER_ACCESS_TOKEN',
            payload: { accessToken, expiresAt },
          })
        }

        return result
      },

      // Resets the customer and sets the global customer access token.
      resetCustomer: async (...args) => {
        const result = await resetCustomer(...args)

        if (result.data) {
          const {
            data: { accessToken, expiresAt },
          } = result

          dispatch({
            type: 'SET_CUSTOMER_ACCESS_TOKEN',
            payload: { accessToken, expiresAt },
          })
        }

        return result
      },

      // Resets the customer and sets the global customer access token.
      resetCustomerByUrl: async (...args) => {
        const result = await resetCustomerByUrl(...args)

        if (result.data) {
          const {
            data: { accessToken, expiresAt },
          } = result

          dispatch({
            type: 'SET_CUSTOMER_ACCESS_TOKEN',
            payload: { accessToken, expiresAt },
          })
        }

        return result
      },
    },
  })
}
