/**
 * Product validation utilities
 * Comprehensive validation functions for admin product creation
 */

// Allowed categories list
const ALLOWED_CATEGORIES = [
  'Vegetables',
  'Fruits',
  'Meat',
  'Fish',
  'Beverages',
  'Juices',
  'Dairy',
  'Snacks',
  'Breakfast',
  'Health',
  'Bakery',
  'Grains',
  'Organic',
  'Fresh',
  'Others',
  'Uncategorized'
]

// Badge enum values
const ALLOWED_BADGES = ['none', 'new', 'hot', 'sell-25', 'sale']

// Stock status enum values
const ALLOWED_STOCK_STATUS = ['In Stock', 'Out of Stock', 'Low Stock']

// Product status enum values
const ALLOWED_PRODUCT_STATUS = ['Active', 'Draft', 'Archived']

// Low stock threshold (configurable)
const LOW_STOCK_THRESHOLD = 10

/**
 * Validate URL format
 * Accepts HTTP/HTTPS URLs and data URLs (base64 images)
 */
export const validateURL = (url) => {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL is required and must be a string' }
  }

  // Check if it's a data URL (base64 image)
  if (url.startsWith('data:image/')) {
    // Validate data URL format: data:image/[type];base64,[data]
    const dataUrlRegex = /^data:image\/(png|jpg|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/
    if (dataUrlRegex.test(url)) {
      return { isValid: true }
    }
    return { isValid: false, error: 'Invalid data URL format. Must be: data:image/[type];base64,[data]' }
  }

  // Check if it's a file path (for local development)
  if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
    return { isValid: true } // Allow file paths
  }

  // Validate HTTP/HTTPS URL
  try {
    const urlObj = new URL(url)
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return { isValid: false, error: 'URL must use http or https protocol' }
    }
    return { isValid: true }
  } catch (error) {
    return { isValid: false, error: 'Invalid URL format' }
  }
}

/**
 * Validate array of URLs
 */
export const validateURLArray = (urls, maxCount = 4) => {
  if (!Array.isArray(urls)) {
    return { isValid: false, error: 'Must be an array' }
  }

  if (urls.length > maxCount) {
    return { isValid: false, error: `Maximum ${maxCount} URLs allowed` }
  }

  for (let i = 0; i < urls.length; i++) {
    const urlValidation = validateURL(urls[i])
    if (!urlValidation.isValid) {
      return { isValid: false, error: `URL at index ${i}: ${urlValidation.error}` }
    }
  }

  return { isValid: true }
}

/**
 * Validate categories array
 */
export const validateCategories = (categories) => {
  if (!Array.isArray(categories)) {
    return { isValid: false, error: 'Categories must be an array' }
  }

  if (categories.length === 0) {
    return { isValid: false, error: 'At least one category is required' }
  }

  const invalidCategories = categories.filter(
    cat => !ALLOWED_CATEGORIES.includes(cat)
  )

  if (invalidCategories.length > 0) {
    return {
      isValid: false,
      error: `Invalid categories: ${invalidCategories.join(', ')}. Allowed: ${ALLOWED_CATEGORIES.join(', ')}`
    }
  }

  return { isValid: true }
}

/**
 * Validate price logic (currentPrice <= originalPrice)
 */
export const validatePriceLogic = (currentPrice, originalPrice) => {
  if (originalPrice === null || originalPrice === undefined) {
    return { isValid: true } // Original price is optional
  }

  const current = parseFloat(currentPrice)
  const original = parseFloat(originalPrice)

  if (isNaN(current) || isNaN(original)) {
    return { isValid: false, error: 'Prices must be valid numbers' }
  }

  if (current < 0 || original < 0) {
    return { isValid: false, error: 'Prices cannot be negative' }
  }

  if (current > original) {
    return {
      isValid: false,
      error: 'Current price cannot be greater than original price'
    }
  }

  return { isValid: true }
}

/**
 * Auto-determine stock status based on stock quantity
 */
export const determineStockStatus = (stockQuantity) => {
  const stock = parseInt(stockQuantity) || 0

  if (stock === 0) {
    return 'Out of Stock'
  } else if (stock > 0 && stock < LOW_STOCK_THRESHOLD) {
    return 'Low Stock'
  } else {
    return 'In Stock'
  }
}

/**
 * Generate URL-friendly slug from name
 */
export const generateSlug = (name) => {
  if (!name || typeof name !== 'string') {
    return ''
  }

  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/-+/g, '-')       // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, '')   // Remove leading/trailing hyphens
}

/**
 * Calculate discount percentage
 */
export const calculateDiscount = (originalPrice, currentPrice) => {
  if (!originalPrice || !currentPrice) {
    return null
  }

  const original = parseFloat(originalPrice)
  const current = parseFloat(currentPrice)

  if (isNaN(original) || isNaN(current) || original === 0) {
    return null
  }

  if (current > original) {
    return null // Invalid case
  }

  const discount = ((original - current) / original) * 100
  return parseFloat(discount.toFixed(2))
}

/**
 * Validate required fields
 */
export const validateRequiredFields = (data) => {
  const errors = {}

  // Required fields
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.name = 'Product name is required'
  }

  if (!data.sku || typeof data.sku !== 'string' || data.sku.trim().length === 0) {
    errors.sku = 'SKU is required'
  }

  if (data.currentPrice === undefined || data.currentPrice === null) {
    errors.currentPrice = 'Current price is required'
  } else {
    const price = parseFloat(data.currentPrice)
    if (isNaN(price) || price <= 0) {
      errors.currentPrice = 'Valid current price (greater than 0) is required'
    }
  }

  if (!data.description || typeof data.description !== 'string' || data.description.trim().length === 0) {
    errors.description = 'Product description is required'
  }

  if (!data.categories || !Array.isArray(data.categories) || data.categories.length === 0) {
    errors.categories = 'At least one category is required'
  }

  if (!data.mainImage || typeof data.mainImage !== 'string' || data.mainImage.trim().length === 0) {
    errors.mainImage = 'Main image URL is required'
  }

  if (data.stockQuantity === undefined || data.stockQuantity === null) {
    errors.stockQuantity = 'Stock quantity is required'
  } else {
    const stock = parseInt(data.stockQuantity)
    if (isNaN(stock) || stock < 0) {
      errors.stockQuantity = 'Stock quantity must be a non-negative integer'
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * Validate optional fields format
 */
export const validateOptionalFields = (data) => {
  const errors = {}

  // Validate slug format if provided
  if (data.slug !== undefined && data.slug !== null) {
    if (typeof data.slug !== 'string') {
      errors.slug = 'Slug must be a string'
    } else if (data.slug.trim().length === 0) {
      errors.slug = 'Slug cannot be empty'
    }
  }

  // Validate original price
  if (data.originalPrice !== undefined && data.originalPrice !== null) {
    const price = parseFloat(data.originalPrice)
    if (isNaN(price) || price < 0) {
      errors.originalPrice = 'Original price must be a valid non-negative number'
    }
  }

  // Validate discount percentage
  if (data.discountPercentage !== undefined && data.discountPercentage !== null) {
    const discount = parseFloat(data.discountPercentage)
    if (isNaN(discount) || discount < 0 || discount > 100) {
      errors.discountPercentage = 'Discount percentage must be between 0 and 100'
    }
  }

  // Validate badge
  if (data.badge !== undefined && data.badge !== null) {
    if (!ALLOWED_BADGES.includes(data.badge)) {
      errors.badge = `Badge must be one of: ${ALLOWED_BADGES.join(', ')}`
    }
  }

  // Validate stock status
  if (data.stockStatus !== undefined && data.stockStatus !== null) {
    if (!ALLOWED_STOCK_STATUS.includes(data.stockStatus)) {
      errors.stockStatus = `Stock status must be one of: ${ALLOWED_STOCK_STATUS.join(', ')}`
    }
  }

  // Validate product status
  if (data.productStatus !== undefined && data.productStatus !== null) {
    if (!ALLOWED_PRODUCT_STATUS.includes(data.productStatus)) {
      errors.productStatus = `Product status must be one of: ${ALLOWED_PRODUCT_STATUS.join(', ')}`
    }
  }

  // Validate rating
  if (data.initialRating !== undefined && data.initialRating !== null) {
    const rating = parseFloat(data.initialRating)
    if (isNaN(rating) || rating < 0 || rating > 5) {
      errors.initialRating = 'Rating must be between 0 and 5'
    }
  }

  // Validate review count
  if (data.initialReviewCount !== undefined && data.initialReviewCount !== null) {
    const count = parseInt(data.initialReviewCount)
    if (isNaN(count) || count < 0) {
      errors.initialReviewCount = 'Review count must be a non-negative integer'
    }
  }

  // Validate main image URL
  if (data.mainImage) {
    const urlValidation = validateURL(data.mainImage)
    if (!urlValidation.isValid) {
      errors.mainImage = urlValidation.error
    }
  }

  // Validate additional images
  if (data.additionalImages !== undefined && data.additionalImages !== null) {
    const urlArrayValidation = validateURLArray(data.additionalImages, 4)
    if (!urlArrayValidation.isValid) {
      errors.additionalImages = urlArrayValidation.error
    }
  }

  // Validate tags
  if (data.tags !== undefined && data.tags !== null) {
    if (!Array.isArray(data.tags)) {
      errors.tags = 'Tags must be an array'
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * Main product data validation function
 */
export const validateProductData = (data) => {
  // Validate required fields
  const requiredValidation = validateRequiredFields(data)
  if (!requiredValidation.isValid) {
    return {
      isValid: false,
      errors: requiredValidation.errors
    }
  }

  // Validate optional fields format
  const optionalValidation = validateOptionalFields(data)
  if (!optionalValidation.isValid) {
    return {
      isValid: false,
      errors: { ...requiredValidation.errors, ...optionalValidation.errors }
    }
  }

  // Validate categories
  const categoriesValidation = validateCategories(data.categories)
  if (!categoriesValidation.isValid) {
    return {
      isValid: false,
      errors: { ...requiredValidation.errors, categories: categoriesValidation.error }
    }
  }

  // Validate price logic
  const priceValidation = validatePriceLogic(data.currentPrice, data.originalPrice)
  if (!priceValidation.isValid) {
    return {
      isValid: false,
      errors: { ...requiredValidation.errors, currentPrice: priceValidation.error }
    }
  }

  return {
    isValid: true,
    errors: {}
  }
}

/**
 * Export constants for use in other modules
 */
export {
  ALLOWED_CATEGORIES,
  ALLOWED_BADGES,
  ALLOWED_STOCK_STATUS,
  ALLOWED_PRODUCT_STATUS,
  LOW_STOCK_THRESHOLD
}
