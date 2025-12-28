/**
 * Password validation utility
 * Validates password against requirements:
 * - 8 or more characters
 * - One uppercase character
 * - One lowercase character
 * - One special character
 * - One number
 */
export const validatePassword = (password) => {
  const errors = []

  if (!password) {
    return { isValid: false, errors: ['Password is required'] }
  }

  if (password.length < 8) {
    errors.push('Use 8 or more characters')
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('One Uppercase character')
  }

  if (!/[a-z]/.test(password)) {
    errors.push('One lowercase character')
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('One special character')
  }

  if (!/[0-9]/.test(password)) {
    errors.push('One number')
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Email validation
 */
export const validateEmail = (email) => {
  if (!email) {
    return { isValid: false, error: 'Email is required' }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Invalid email format' }
  }

  return { isValid: true }
}

/**
 * Username validation
 */
export const validateUsername = (username) => {
  if (!username) {
    return { isValid: false, error: 'Username is required' }
  }

  if (username.length < 3) {
    return { isValid: false, error: 'Username must be at least 3 characters' }
  }

  if (username.length > 30) {
    return { isValid: false, error: 'Username must be less than 30 characters' }
  }

  const usernameRegex = /^[a-zA-Z0-9_]+$/
  if (!usernameRegex.test(username)) {
    return { isValid: false, error: 'Username can only contain letters, numbers, and underscores' }
  }

  return { isValid: true }
}

