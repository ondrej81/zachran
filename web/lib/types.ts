export type WishlistItem = {
  id: string;
  rohlik_product_id: number;
  name: string;
  image_url: string | null;
  source_url: string;
  min_discount_pct: number;
  is_active: boolean;
  created_at: string;
  // Status from the most recent dispatch-alerts run
  last_check_at: string | null;
  last_sale_price: number | null;
  last_original_price: number | null;
  last_discount_pct: number | null;
  last_sale_valid_till: string | null;
  last_check_error: string | null;
};

export type Settings = {
  id: 1;
  alert_email: string;
  alert_hour: number;
  default_min_discount_pct: number;
  warehouse_label: string | null;
  updated_at: string;
};
