import Link from 'next/link';
import { PRODUCT_TYPE_LABEL, SPEC_FIELDS } from '@app/products';
import { requireQuyen } from '@/lib/auth';
import { NewBatchForm } from './form';

export default async function NewBatchPage() {
  await requireQuyen('san-pham');
  return (
    <>
      <h1>Nhập nhiều màu</h1>
      <p className="muted">
        Cùng một mẫu, nhiều màu: điền phiếu thông số <strong>một lần</strong>, rồi liệt kê các màu. AI viết lần lượt từng màu, màu sau đọc bài
        màu trước để không viết lặp. Chỉ có một sản phẩm? <Link href="/products/new">Nhập một sản phẩm</Link>.
      </p>
      <NewBatchForm fieldsByType={SPEC_FIELDS} typeLabels={PRODUCT_TYPE_LABEL} />
    </>
  );
}
