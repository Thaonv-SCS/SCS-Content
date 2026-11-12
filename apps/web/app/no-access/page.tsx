export default function NoAccessPage() {
  return (
    <div className="card login">
      <h1>Chưa được cấp quyền</h1>
      <p className="muted">Tài khoản này chưa được gán vai trò. Nhờ admin cấp quyền rồi đăng nhập lại.</p>
    </div>
  );
}
