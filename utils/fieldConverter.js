/**
 * Field name converter utility
 * Converts camelCase field names from frontend to snake_case for database
 */

/**
 * Converts product data from camelCase to snake_case format
 * Handles special mappings and extracts non-column fields
 * 
 * @param {Object} data - Product data in camelCase format
 * @returns {Object} - Object with converted data and extracted special fields
 * @returns {Object} converted - Converted product data in snake_case
 * @returns {Array} categories - Extracted categories array (not a column)
 */
export const convertProductFields = (data) => {
  const converted = { ...data }
  const result = { converted, categories: undefined }

  // Extract categories separately (not a column in products table)
  if (converted.categories !== undefined) {
    result.categories = converted.categories
    delete converted.categories
  }

  // Special mappings (different field names)
  if (converted.stockQuantity !== undefined) {
    converted.stock = converted.stockQuantity
    delete converted.stockQuantity
  }

  if (converted.initialRating !== undefined) {
    converted.rating = converted.initialRating
    delete converted.initialRating
  }

  if (converted.initialReviewCount !== undefined) {
    converted.review_count = converted.initialReviewCount
    delete converted.initialReviewCount
  }

  // Standard camelCase to snake_case conversions
  const fieldMappings = {
    // Price fields
    currentPrice: 'current_price',
    originalPrice: 'original_price',
    discountPercentage: 'discount_percentage',
    
    // Description fields
    shortDescription: 'short_description',
    
    // Image fields
    mainImage: 'main_image',
    additionalImages: 'additional_images',
    imageUrl: 'image_url', // Legacy field
    
    // Status fields
    stockStatus: 'stock_status',
    productStatus: 'product_status',
    
    // Count fields
    reviewCount: 'review_count',
    
    // String fields
    weightString: 'weight_string',
    
    // Boolean fields
    isOrganic: 'is_organic',
    isFresh: 'is_fresh',
    
    // Date fields
    expiryDate: 'expiry_date',
    
    // Timestamp fields (usually shouldn't be updated, but handle if sent)
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }

  // Apply all field mappings
  for (const [camelCase, snakeCase] of Object.entries(fieldMappings)) {
    if (converted[camelCase] !== undefined) {
      // Handle arrays (like additionalImages)
      if (camelCase === 'additionalImages') {
        converted[snakeCase] = Array.isArray(converted[camelCase]) 
          ? converted[camelCase] 
          : []
      } else {
        converted[snakeCase] = converted[camelCase]
      }
      delete converted[camelCase]
    }
  }

  // Convert stockQuantity to integer if it exists
  if (converted.stock !== undefined && typeof converted.stock === 'string') {
    converted.stock = parseInt(converted.stock) || 0
  }

  // Convert numeric fields
  if (converted.current_price !== undefined && typeof converted.current_price === 'string') {
    converted.current_price = parseFloat(converted.current_price)
  }
  if (converted.original_price !== undefined && typeof converted.original_price === 'string') {
    converted.original_price = parseFloat(converted.original_price)
  }
  if (converted.discount_percentage !== undefined && typeof converted.discount_percentage === 'string') {
    converted.discount_percentage = parseFloat(converted.discount_percentage)
  }
  if (converted.rating !== undefined && typeof converted.rating === 'string') {
    converted.rating = parseFloat(converted.rating)
  }
  if (converted.review_count !== undefined && typeof converted.review_count === 'string') {
    converted.review_count = parseInt(converted.review_count) || 0
  }

  // Convert boolean fields
  if (converted.is_organic !== undefined) {
    converted.is_organic = Boolean(converted.is_organic)
  }
  if (converted.is_fresh !== undefined) {
    converted.is_fresh = Boolean(converted.is_fresh)
  }
  if (converted.featured !== undefined) {
    converted.featured = Boolean(converted.featured)
  }

  result.converted = converted
  return result
}
