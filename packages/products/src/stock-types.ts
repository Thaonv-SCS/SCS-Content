/** Kiểu + nhãn tình trạng hàng — không gọi mạng, dùng được ở trình duyệt. */
export type StockStatus = 'instock' | 'outofstock';
export type Visibility = 'visible' | 'catalog' | 'search' | 'hidden';

export const STOCK_LABEL: Record<string, string> = {
  instock: 'Còn hàng',
  outofstock: 'Hết hàng',
  onbackorder: 'Đặt trước',
};

/** Tên giống ô "Hiển thị trong danh mục" của WooCommerce. */
export const VISIBILITY_LABEL: Record<Visibility, string> = {
  visible: 'Cửa hàng & tìm kiếm',
  catalog: 'Chỉ cửa hàng',
  search: 'Chỉ khi tìm kiếm',
  hidden: 'Ẩn',
};

export interface StockItem {
  id: number;
  name: string;
  sku: string;
  stock_status: string;
  catalog_visibility: Visibility;
  permalink: string;
  status: string;
}

export interface StockUpdate {
  id: number;
  stock_status?: StockStatus;
  catalog_visibility?: Visibility;
}
