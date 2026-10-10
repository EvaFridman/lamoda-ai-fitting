// Which request field each database constraint guards, so a write the database refuses still
// answers with a field in `details`. Built from api/prisma/migrations/*/migration.sql (CHECK rules
// exist only there, schema.prisma does not model them); a new constraint gets a row here in the
// same commit. Fields are the api's names (camelCase), not the columns.
export const CONSTRAINT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  // CHECK
  ai_generations_error_message_check: ['errorMessage'],
  ai_generations_result_image_key_check: ['resultImageKey'],
  ai_generations_status_check: ['status'],
  ai_generations_user_image_key_check: ['userImageKey'],
  attribute_values_value_check: ['value'],
  attributes_name_check: ['name'],
  brands_name_check: ['name'],
  categories_name_check: ['name'],
  categories_slug_check: ['slug'],
  categories_sort_order_check: ['sortOrder'],
  product_images_image_key_check: ['imageKey'],
  product_images_sort_order_check: ['sortOrder'],
  product_variations_size_check: ['size'],
  product_variations_stock_check: ['stock'],
  products_article_check: ['article'],
  products_discount_check: ['discount'],
  products_name_check: ['name'],
  products_price_check: ['price'],
  products_rating_check: ['rating'],
  users_date_of_birth_check: ['dateOfBirth'],
  users_email_check: ['email'],
  users_first_name_check: ['firstName'],
  users_fitting_profile_image_key_check: ['fittingProfileImageKey'],
  users_last_name_check: ['lastName'],
  users_patronymic_check: ['patronymic'],
  users_phone_check: ['phone'],

  // Unique: the field a caller changes to resolve the conflict (a size is unique per product).
  attribute_values_attribute_id_value_key: ['value'],
  attributes_name_key: ['name'],
  brands_name_key: ['name'],
  categories_name_key: ['name'],
  categories_slug_key: ['slug'],
  fitting_sessions_user_id_key: ['userId'],
  // A composite primary key a write can repeat: the value already linked to the product.
  product_attribute_values_pkey: ['attributeValueId'],
  product_variations_product_id_size_key: ['size'],
  products_article_key: ['article'],
  users_email_key: ['email'],
  users_phone_key: ['phone'],

  // Foreign keys: the field holding the reference.
  ai_generations_session_id_fkey: ['sessionId'],
  attribute_values_attribute_id_fkey: ['attributeId'],
  fitting_sessions_user_id_fkey: ['userId'],
  generation_products_generation_id_fkey: ['generationId'],
  generation_products_product_id_fkey: ['productId'],
  product_attribute_values_attribute_value_id_fkey: ['attributeValueId'],
  product_attribute_values_product_id_fkey: ['productId'],
  product_images_product_id_fkey: ['productId'],
  product_variations_product_id_fkey: ['productId'],
  products_brand_id_fkey: ['brandId'],
  products_category_id_fkey: ['categoryId'],
};

export function constraintFields(name: string | undefined): readonly string[] {
  if (name === undefined || !Object.hasOwn(CONSTRAINT_FIELDS, name)) return [];
  return CONSTRAINT_FIELDS[name] ?? [];
}
