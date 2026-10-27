// Which request field each database constraint guards, so a write the database refuses still
// answers with a field in `details`. Built from api/prisma/migrations/*/migration.sql (CHECK rules
// exist only there, schema.prisma does not model them); a new constraint gets a row here in the
// same commit. Fields are the api's names (camelCase), not the columns.
export const CONSTRAINT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  // CHECK
  ai_generations_comment_check: ['comment'],
  ai_generations_error_message_check: ['errorMessage'],
  ai_generations_failure_safety_check: ['failureCategory', 'failureStage'],
  ai_generations_fingerprint_check: ['fingerprint'],
  ai_generations_owner_check: ['userId'],
  ai_generations_prompt_text_check: ['promptText'],
  ai_generations_provider_request_id_check: ['providerRequestId'],
  // The regeneration's body names its list `reasons` (spec 0019 plan §5).
  ai_generations_regeneration_reasons_check: ['reasons'],
  ai_generations_result_image_key_check: ['resultImageKey'],
  ai_generations_status_check: ['status'],
  ai_generations_user_image_key_check: ['userImageKey'],
  attribute_values_color_hex_check: ['colorHex'],
  attribute_values_value_check: ['value'],
  attributes_name_check: ['name'],
  brands_name_check: ['name'],
  categories_name_check: ['name'],
  categories_slug_check: ['slug'],
  categories_sort_order_check: ['sortOrder'],
  file_deletions_prefixes_check: ['prefixes'],
  fitting_quota_month_check: ['month'],
  fitting_quota_used_check: ['used'],
  product_images_image_key_check: ['imageKey'],
  product_images_sort_order_check: ['sortOrder'],
  product_variations_size_check: ['size'],
  product_variations_stock_check: ['stock'],
  products_article_check: ['article'],
  products_discount_check: ['discount'],
  products_name_check: ['name'],
  products_price_check: ['price'],
  products_rating_check: ['rating'],
  stores_city_check: ['city'],
  stores_code_check: ['code'],
  stores_description_check: ['description'],
  stores_house_check: ['house'],
  stores_latitude_check: ['latitude'],
  stores_longitude_check: ['longitude'],
  stores_mall_check: ['mall'],
  stores_metro_stations_check: ['metroStations'],
  stores_name_check: ['name'],
  stores_phones_check: ['phones'],
  stores_position_check: ['position'],
  stores_street_check: ['street'],
  stores_work_time_check: ['workTime'],
  users_date_of_birth_check: ['dateOfBirth'],
  users_email_check: ['email'],
  users_first_name_check: ['firstName'],
  users_fitting_profile_image_key_check: ['fittingProfileImageKey'],
  users_last_name_check: ['lastName'],
  users_patronymic_check: ['patronymic'],
  users_phone_check: ['phone'],
  users_photo_consent_check: ['consent'],
  user_photos_height_check: ['height'],
  user_photos_image_key_check: ['imageKey'],
  user_photos_width_check: ['width'],

  // Unique: the field a caller changes to resolve the conflict (a size is unique per product).
  // Better Auth's own writes (spec 0013 plan §2); its answers never pass the api's filter, so
  // these only name the field should another write hit them.
  accounts_provider_id_account_id_key: ['accountId'],
  // One running generation per fingerprint (spec 0019 A32): another photo, items or text is
  // another fitting. The route answers the running one first; this covers a write that skips it.
  ai_generations_user_id_fingerprint_key: ['photoId', 'items', 'promptText'],
  // The owner keys' targets (A65): `id` is unique on its own, so a write never hits these.
  ai_generations_id_user_id_key: ['id'],
  fitting_sessions_id_user_id_key: ['id'],
  user_photos_id_user_id_key: ['id'],
  attribute_values_attribute_id_value_key: ['value'],
  attributes_name_key: ['name'],
  brands_name_key: ['name'],
  categories_name_key: ['name'],
  categories_slug_key: ['slug'],
  // One deletion per row (spec 0019 A38): a repeat names the row again.
  file_deletions_kind_row_id_key: ['rowId'],
  // One spend row per user and month (spec 0019 A20).
  fitting_quota_pkey: ['month'],
  // One item per slot (spec 0019 A12): the route replaces it, so a write never hits this.
  fitting_room_items_pkey: ['slot'],
  fitting_sessions_user_id_key: ['userId'],
  // The api refuses a repeated product id first (spec 0004 E53); this covers a write that skips it.
  generation_products_pkey: ['productIds'],
  // A composite primary key a write can repeat: the value already linked to the product.
  product_attribute_values_pkey: ['attributeValueId'],
  product_variations_product_id_size_key: ['size'],
  products_article_key: ['article'],
  sessions_token_key: ['token'],
  // Lamoda's code and order (spec 0022 X1): only the seed writes stores.
  stores_code_key: ['code'],
  stores_position_key: ['position'],
  // One default photo per user (spec 0019 A31; the partial index, as fitting sessions').
  user_photos_user_id_key: ['userId'],
  users_email_key: ['email'],
  users_phone_key: ['phone'],

  // Foreign keys: the field holding the reference.
  accounts_user_id_fkey: ['userId'],
  // The owner keys (spec 0019 A65): someone else's photo, result or session is refused as missing.
  ai_generations_parent_id_user_id_fkey: ['parentId'],
  ai_generations_photo_id_user_id_fkey: ['photoId'],
  ai_generations_session_id_fkey: ['sessionId'],
  ai_generations_session_id_user_id_fkey: ['sessionId'],
  ai_generations_user_id_fkey: ['userId'],
  attribute_values_attribute_id_fkey: ['attributeId'],
  fitting_quota_user_id_fkey: ['userId'],
  // A colour of another product is refused as missing (spec 0019 A86).
  fitting_room_items_product_id_attribute_value_id_fkey: ['attributeValueId'],
  fitting_room_items_product_id_fkey: ['productId'],
  fitting_room_items_user_id_fkey: ['userId'],
  fitting_sessions_user_id_fkey: ['userId'],
  // A fitting's colours come in its list of items (spec 0019 plan §5).
  generation_products_attribute_value_id_fkey: ['items'],
  generation_products_generation_id_fkey: ['generationId'],
  // A generation's products are sent as one list (spec 0004 E52).
  generation_products_product_id_fkey: ['productIds'],
  product_attribute_values_attribute_value_id_fkey: ['attributeValueId'],
  product_attribute_values_product_id_fkey: ['productId'],
  product_images_product_id_fkey: ['productId'],
  product_variations_product_id_fkey: ['productId'],
  products_brand_id_fkey: ['brandId'],
  products_category_id_fkey: ['categoryId'],
  sessions_user_id_fkey: ['userId'],
  user_photos_user_id_fkey: ['userId'],
};

export function constraintFields(name: string | undefined): readonly string[] {
  if (name === undefined || !Object.hasOwn(CONSTRAINT_FIELDS, name)) return [];
  return CONSTRAINT_FIELDS[name] ?? [];
}
