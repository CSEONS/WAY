import { Link } from "react-router-dom";

export function AdminPage() {
  return (
    <section className="page page-admin">
      <h1>Админ-панель</h1>
      <div>
        <div>
          <h2>Разделы</h2>
          <nav>
            <Link to="/admin/owners">Владельцы</Link>
            <Link to="/admin/stores">Магазины</Link>
          </nav>
        </div>
      </div>
    </section>
  );
}
