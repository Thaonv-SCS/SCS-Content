import Link from 'next/link';
import { PRODUCT_TYPE_LABEL } from '@app/products';
import { requireQuyen } from '@/lib/auth';
import { ImportForm } from './form';

export default async function ImportPage() {
  await requireQuyen('san-pham');
  return (
    <>
      <p className="meta">
        <Link href="/products">← Post sản phẩm</Link>
      </p>
      <h1>Nhập từ Excel</h1>
      <p className="muted">
        Nhiều sản phẩm <strong>khác nhau</strong> trong một file: mỗi dòng là một sản phẩm với phiếu thông số riêng. Mỗi lần nhập chọn một loại sản
        phẩm (giày, bóng…) vì cột thông số khác nhau theo loại. Cùng một mẫu nhiều màu thì dùng{' '}
        <Link href="/products/batch/new">Nhập nhiều màu</Link> cho nhanh hơn.
      </p>
      <ImportForm typeLabels={PRODUCT_TYPE_LABEL} />
    </>
  );
}
