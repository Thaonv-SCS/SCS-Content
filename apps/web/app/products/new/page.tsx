import Link from 'next/link';
import { PRODUCT_TYPE_LABEL, SPEC_FIELDS } from '@app/products';
import { requireTeam } from '@/lib/auth';
import { NewProductForm } from './form';

export default async function NewProductPage() {
  await requireTeam();
  return (
    <>
      <h1>Sản phẩm mới</h1>
      <p className="muted">
        Điền các ý chính như khi lên sản phẩm. Ô nào chưa rõ cứ để trống — AI sẽ báo thiếu, hoặc bấm "Tìm thêm thông tin" sau. Cùng mẫu nhiều
        màu? <Link href="/products/batch/new">Nhập nhiều màu một lần</Link>.
      </p>
      <NewProductForm fieldsByType={SPEC_FIELDS} typeLabels={PRODUCT_TYPE_LABEL} />
    </>
  );
}
