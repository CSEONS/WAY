import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { ConfirmModal } from "../components/ConfirmModal";
import type { User } from "../types/models";

export function AdminOwnersPage() {
  const [owners, setOwners] = useState<User[]>([]);
  const [ownerForm, setOwnerForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [ownerToEdit, setOwnerToEdit] = useState<User | null>(null);
  const [ownerEditForm, setOwnerEditForm] = useState({ name: "", email: "", phone: "" });
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [openOwnerActions, setOpenOwnerActions] = useState<string | null>(null);
  const [passwordModalOwnerId, setPasswordModalOwnerId] = useState<string | null>(null);
  const [ownerToDelete, setOwnerToDelete] = useState<User | null>(null);
  const passwordModalOwner = owners.find((owner) => owner.id === passwordModalOwnerId);

  async function load() {
    const ownersRes = await api.get("/admin/owners");
    setOwners(ownersRes.data);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    function closeActions(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest("[data-owner-actions]")) return;
      setOpenOwnerActions(null);
    }

    document.addEventListener("pointerdown", closeActions);
    return () => document.removeEventListener("pointerdown", closeActions);
  }, []);

  useEffect(() => {
    function closeModal(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOwnerToEdit(null);
      setPasswordModalOwnerId(null);
      setOwnerToDelete(null);
      setOpenOwnerActions(null);
    }

    document.addEventListener("keydown", closeModal);
    return () => document.removeEventListener("keydown", closeModal);
  }, []);

  async function createOwner(event: FormEvent) {
    event.preventDefault();
    await api.post("/admin/owners", ownerForm);
    setOwnerForm({ name: "", email: "", phone: "", password: "" });
    load();
  }

  async function changePassword(event: FormEvent, ownerId: string) {
    event.preventDefault();
    const password = passwords[ownerId]?.trim();
    if (!password) return;
    await api.post(`/admin/owners/${ownerId}/change-password`, { password });
    setPasswords((current) => ({ ...current, [ownerId]: "" }));
    setPasswordModalOwnerId(null);
    setOpenOwnerActions(null);
    load();
  }

  function openEditModal(owner: User) {
    setOwnerToEdit(owner);
    setOwnerEditForm({ name: owner.name, email: owner.email ?? "", phone: owner.phone ?? "" });
    setOpenOwnerActions(null);
  }

  async function updateOwner(event: FormEvent) {
    event.preventDefault();
    if (!ownerToEdit) return;
    await api.patch(`/admin/owners/${ownerToEdit.id}`, {
      name: ownerEditForm.name,
      email: ownerEditForm.email || null,
      phone: ownerEditForm.phone || null
    });
    setOwnerToEdit(null);
    load();
  }

  function openPasswordModal(ownerId: string) {
    setPasswordModalOwnerId(ownerId);
    setOpenOwnerActions(null);
  }

  function openDeleteModal(owner: User) {
    setOwnerToDelete(owner);
    setOpenOwnerActions(null);
  }

  async function deleteOwner() {
    if (!ownerToDelete) return;
    await api.delete(`/admin/owners/${ownerToDelete.id}`);
    setOwnerToDelete(null);
    load();
  }

  return (
    <section>
      <h1>Управление владельцами</h1>
      <p>Создавайте и просматривайте владельцев отдельно от магазинов.</p>
      <div className="admin-grid">
        <div className="panel">
          <h2>Создать владельца</h2>
          <form className="form" onSubmit={createOwner}>
            <label>
              Имя
              <input value={ownerForm.name} onChange={(e) => setOwnerForm({ ...ownerForm, name: e.target.value })} required />
            </label>
            <label>
              Email
              <input value={ownerForm.email} onChange={(e) => setOwnerForm({ ...ownerForm, email: e.target.value })} />
            </label>
            <label>
              Телефон
              <input value={ownerForm.phone} onChange={(e) => setOwnerForm({ ...ownerForm, phone: e.target.value })} />
            </label>
            <label>
              Пароль
              <input value={ownerForm.password} onChange={(e) => setOwnerForm({ ...ownerForm, password: e.target.value })} required />
            </label>
            <button className="primary">Создать</button>
          </form>
        </div>
        <div className="panel">
          <h2>Список владельцев</h2>
          <div className="table">
            {owners.map((owner) => (
              <div className="row owner-row" key={owner.id}>
                <span>{owner.name}</span>
                <span>{owner.email || owner.phone}</span>
                <div className="action-menu" data-owner-actions>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Операции владельца ${owner.name}`}
                    aria-expanded={openOwnerActions === owner.id}
                    onClick={() => setOpenOwnerActions(openOwnerActions === owner.id ? null : owner.id)}
                  >
                    <MoreVerticalIcon />
                  </button>
                  {openOwnerActions === owner.id && (
                    <div className="action-menu-content" role="menu">
                      <button className="menu-action" type="button" role="menuitem" onClick={() => openEditModal(owner)}>
                        Редактировать
                      </button>
                      <button className="menu-action" type="button" role="menuitem" onClick={() => openPasswordModal(owner.id)}>
                        Сменить пароль
                      </button>
                      <button className="menu-action danger-menu-action" type="button" role="menuitem" onClick={() => openDeleteModal(owner)}>
                        Удалить владельца
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {ownerToEdit && (
        <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.currentTarget === event.target && setOwnerToEdit(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-owner-title">
            <div className="modal-head">
              <div>
                <h2 id="edit-owner-title">Редактировать владельца</h2>
                <p>{ownerToEdit.name}</p>
              </div>
              <button className="icon-button" type="button" aria-label="Закрыть" onClick={() => setOwnerToEdit(null)}>
                <CloseIcon />
              </button>
            </div>
            <form className="form" onSubmit={updateOwner}>
              <label>
                Имя
                <input value={ownerEditForm.name} onChange={(e) => setOwnerEditForm({ ...ownerEditForm, name: e.target.value })} required autoFocus />
              </label>
              <label>
                Email
                <input value={ownerEditForm.email} onChange={(e) => setOwnerEditForm({ ...ownerEditForm, email: e.target.value })} />
              </label>
              <label>
                Телефон
                <input value={ownerEditForm.phone} onChange={(e) => setOwnerEditForm({ ...ownerEditForm, phone: e.target.value })} />
              </label>
              <div className="modal-actions">
                <button type="button" onClick={() => setOwnerToEdit(null)}>
                  Отмена
                </button>
                <button className="primary">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {passwordModalOwner && (
        <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.currentTarget === event.target && setPasswordModalOwnerId(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
            <div className="modal-head">
              <div>
                <h2 id="change-password-title">Сменить пароль</h2>
                <p>{passwordModalOwner.name}</p>
              </div>
              <button className="icon-button" type="button" aria-label="Закрыть" onClick={() => setPasswordModalOwnerId(null)}>
                <CloseIcon />
              </button>
            </div>
            <form className="form" onSubmit={(event) => changePassword(event, passwordModalOwner.id)}>
              <label>
                Новый пароль
                <input
                  type="password"
                  value={passwords[passwordModalOwner.id] ?? ""}
                  onChange={(e) => setPasswords({ ...passwords, [passwordModalOwner.id]: e.target.value })}
                  minLength={6}
                  required
                  autoFocus
                />
              </label>
              <div className="modal-actions">
                <button type="button" onClick={() => setPasswordModalOwnerId(null)}>
                  Отмена
                </button>
                <button className="primary">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {ownerToDelete && (
        <ConfirmModal
          title="Удалить владельца?"
          description={`Владелец "${ownerToDelete.name}" и связанные с ним магазины будут удалены. Это действие нельзя отменить.`}
          confirmLabel="Удалить"
          danger
          onCancel={() => setOwnerToDelete(null)}
          onConfirm={deleteOwner}
        />
      )}
      <p>
        <Link to="/admin">← Назад в админку</Link>
      </p>
    </section>
  );
}

function MoreVerticalIcon() {
  return (
    <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.7 5.3 12 10.6l5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3z" />
    </svg>
  );
}
