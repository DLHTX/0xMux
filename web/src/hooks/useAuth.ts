import { useState, useEffect, useCallback } from 'react'
import {
  getAuthStatus,
  setupPassword as apiSetupPassword,
  skipPasswordSetup as apiSkipPasswordSetup,
  login as apiLogin,
  changePassword as apiChangePassword,
  setAuthToken,
  getAuthToken,
} from '../lib/api'
import type {
  AuthStatusResponse,
  SetupPasswordRequest,
  LoginRequest,
  ChangePasswordRequest,
} from '../lib/types'

export function useAuth() {
  const [status, setStatus] = useState<AuthStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const checkStatus = useCallback(async () => {
    try {
      const data = await getAuthStatus()
      setStatus(data)
    } catch (error) {
      console.error('Failed to check auth status:', error)
      // 如果检查失败，假设未初始化
      setStatus({ initialized: false, authenticated: false })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // 初始化时从localStorage读取token
    const token = getAuthToken()
    if (token) {
      setAuthToken(token)
    }
    checkStatus()
  }, [checkStatus])

  const setup = useCallback(async (data: SetupPasswordRequest) => {
    const { token } = await apiSetupPassword(data)
    setAuthToken(token)
    setStatus({ initialized: true, authenticated: true })
  }, [])

  const skip = useCallback(async () => {
    const { token } = await apiSkipPasswordSetup()
    setAuthToken(token)
    setStatus({ initialized: true, authenticated: true })
  }, [])

  const login = useCallback(async (data: LoginRequest) => {
    const { token } = await apiLogin(data)
    setAuthToken(token)
    setStatus({ initialized: true, authenticated: true })
  }, [])

  const logout = useCallback(() => {
    setAuthToken(null)
    setStatus((prev) => (prev ? { ...prev, authenticated: false } : null))
  }, [])

  const changePasswordFn = useCallback(async (data: ChangePasswordRequest) => {
    await apiChangePassword(data)
  }, [])

  return {
    status,
    loading,
    setup,
    skip,
    login,
    logout,
    changePassword: changePasswordFn,
  }
}
