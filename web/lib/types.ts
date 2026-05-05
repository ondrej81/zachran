export type WishlistItem = {
  id: string;
  rohlik_product_id: number;
  name: string;
  image_url: string | null;
  source_url: string;
  min_discount_pct: number;
  is_active: boolean;
  created_at: string;
};

export type TodaysMatch = {
  wishlist_item_id: string;
  rohlik_product_id: number;
  wishlist_name: string;
  min_discount_pct: number;
  name: string;
  image_url: string | null;
  url: string | null;
  sale_price: number | null;
  original_price: number | null;
  discount_pct: number | null;
  sale_text: string | null;
  sale_valid_till: string | null;
};

export type Settings = {
  id: 1;
  alert_email: string;
  alert_hour: number;
  default_min_discount_pct: number;
  warehouse_label: string | null;
  updated_at: string;
};
