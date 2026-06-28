import { Link } from "react-router-dom";

export function AdminPage() {
  return (
    <section>
      <h1>Админ-панель</h1>
      <div className="admin-grid">
        <div className="panel">
          <h2>Разделы</h2>
          <nav className="admin-nav">
            <Link to="/admin/owners">Владельцы</Link>
            <Link to="/admin/stores">Магазины</Link>
          </nav>
        </div>
      </div>
    </section>
  );
}
