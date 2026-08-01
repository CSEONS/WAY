import { HugeiconsIcon } from "@hugeicons/react";
import { Store01Icon, UserAccountIcon } from "@hugeicons/core-free-icons";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export function AdminPage() {
  return (
    <section className="page page-admin page-legacy">
      <h1>Админ-панель</h1>
      <div className="panel">
        <h2>Разделы</h2>
        <nav>
          <Link to="/admin/owners">
            <span>
              <HugeiconsIcon icon={UserAccountIcon} size={18} strokeWidth={1.8} />
              Владельцы
            </span>
            <ChevronRight size={16} strokeWidth={2} />
          </Link>
          <Link to="/admin/stores">
            <span>
              <HugeiconsIcon icon={Store01Icon} size={18} strokeWidth={1.8} />
              Магазины
            </span>
            <ChevronRight size={16} strokeWidth={2} />
          </Link>
        </nav>
      </div>
    </section>
  );
}

