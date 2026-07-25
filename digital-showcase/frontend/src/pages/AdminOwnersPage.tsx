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
      <div>
        <div>
          <h2>Создать владельца</h2>
          <form onSubmit={createOwner}>
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
              <input type="tel" value={ownerForm.phone} placeholder="+79280123456" onChange={(e) => setOwnerForm({ ...ownerForm, phone: e.target.value })} />
            </label>
            <label>
              Пароль
              <input value={ownerForm.password} onChange={(e) => setOwnerForm({ ...ownerForm, password: e.target.value })} required />
            </label>
            <button>Создать</button>
          </form>
        </div>
        <div>
          <h2>Список владельцев</h2>
          <div>
            {owners.map((owner) => (
              <div key={owner.id}>
                <span>{owner.name}</span>
                <span>{owner.email || owner.phone}</span>
                <div data-owner-actions>
                  <button
                   
                    type="button"
                    aria-label={`Операции владельца ${owner.name}`}
                    aria-expanded={openOwnerActions === owner.id}
                    onClick={() => setOpenOwnerActions(openOwnerActions === owner.id ? null : owner.id)}
                  >
                    <MoreVerticalIcon />
                  </button>
                  {openOwnerActions === owner.id && (
                    <div role="menu">
                      <button type="button" role="menuitem" onClick={() => openEditModal(owner)}>
                        Редактировать
                      </button>
                      <button type="button" role="menuitem" onClick={() => openPasswordModal(owner.id)}>
                        Сменить пароль
                      </button>
                      <button type="button" role="menuitem" onClick={() => openDeleteModal(owner)}>
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
        <div role="presentation" onPointerDown={(event) => event.currentTarget === event.target && setOwnerToEdit(null)}>
          <div role="dialog" aria-modal="true">
            <div>
              <div>
                <h2>Редактировать владельца</h2>
                <p>{ownerToEdit.name}</p>
              </div>
              <button type="button" aria-label="Закрыть" onClick={() => setOwnerToEdit(null)}>
                <CloseIcon />
              </button>
            </div>
            <form onSubmit={updateOwner}>
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
                <input type="tel" value={ownerEditForm.phone} placeholder="+79280123456" onChange={(e) => setOwnerEditForm({ ...ownerEditForm, phone: e.target.value })} />
              </label>
              <div>
                <button type="button" onClick={() => setOwnerToEdit(null)}>
                  Отмена
                </button>
                <button>Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {passwordModalOwner && (
        <div role="presentation" onPointerDown={(event) => event.currentTarget === event.target && setPasswordModalOwnerId(null)}>
          <div role="dialog" aria-modal="true">
            <div>
              <div>
                <h2>Сменить пароль</h2>
                <p>{passwordModalOwner.name}</p>
              </div>
              <button type="button" aria-label="Закрыть" onClick={() => setPasswordModalOwnerId(null)}>
                <CloseIcon />
              </button>
            </div>
            <form onSubmit={(event) => changePassword(event, passwordModalOwner.id)}>
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
              <div>
                <button type="button" onClick={() => setPasswordModalOwnerId(null)}>
                  Отмена
                </button>
                <button>Сохранить</button>
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
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.7 5.3 12 10.6l5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3z" />
    </svg>
  );
}
