import { Copy01Icon, Delete02Icon, Edit02Icon, Key01Icon, LockKeyIcon, UserAccountIcon } from "@hugeicons/core-free-icons";
import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import type { User } from "../types/models";
import { Button, Card, CardHeader, ConfirmModal, EmptyState, Field, Icon, Input, Menu, Modal, Page, PageHeader, useCopyToClipboard, useToast } from "../ui";
import styles from "./Admin.module.css";

const emptyOwnerForm = { name: "", email: "", phone: "", password: "" };

/** 8 digits: easy to dictate over the phone and to type on a phone keypad. */
function generatePassword() {
  const digits = new Uint32Array(8);
  crypto.getRandomValues(digits);
  return [...digits].map((value) => value % 10).join("");
}

/** «4827 1936» — groups of four are easier to read aloud. */
function formatForDictation(password: string) {
  return /^\d{8}$/.test(password) ? `${password.slice(0, 4)} ${password.slice(4)}` : password;
}

function errorMessage(err: any, fallback: string) {
  return err?.response?.data?.message ?? fallback;
}

export function AdminOwnersPage() {
  const toast = useToast();
  const [owners, setOwners] = useState<User[]>([]);
  const [ownerForm, setOwnerForm] = useState(emptyOwnerForm);
  const [isCreating, setIsCreating] = useState(false);
  const [ownerToEdit, setOwnerToEdit] = useState<User | null>(null);
  const [ownerEditForm, setOwnerEditForm] = useState({ name: "", email: "", phone: "" });
  const [passwordOwner, setPasswordOwner] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [ownerToDelete, setOwnerToDelete] = useState<User | null>(null);
  /** Shown once after a password is set, so the admin can pass it on. */
  const [issuedPassword, setIssuedPassword] = useState<{ owner: string; login: string; password: string } | null>(null);
  const copy = useCopyToClipboard();

  async function load() {
    const ownersRes = await api.get("/admin/owners");
    setOwners(ownersRes.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function createOwner(event: FormEvent) {
    event.preventDefault();
    setIsCreating(true);
    try {
      await api.post("/admin/owners", ownerForm);
      setIssuedPassword({ owner: ownerForm.name, login: ownerForm.phone || ownerForm.email, password: ownerForm.password });
      setOwnerForm(emptyOwnerForm);
      load();
    } catch (err) {
      toast.show(errorMessage(err, "Не удалось создать владельца"), { tone: "danger" });
    } finally {
      setIsCreating(false);
    }
  }

  function openEditModal(owner: User) {
    setOwnerToEdit(owner);
    setOwnerEditForm({ name: owner.name, email: owner.email ?? "", phone: owner.phone ?? "" });
  }

  async function updateOwner(event: FormEvent) {
    event.preventDefault();
    if (!ownerToEdit) return;
    try {
      await api.patch(`/admin/owners/${ownerToEdit.id}`, {
        name: ownerEditForm.name,
        email: ownerEditForm.email || null,
        phone: ownerEditForm.phone || null
      });
      setOwnerToEdit(null);
      load();
    } catch (err) {
      toast.show(errorMessage(err, "Не удалось сохранить владельца"), { tone: "danger" });
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    const password = newPassword.trim();
    if (!passwordOwner || !password) return;
    try {
      await api.post(`/admin/owners/${passwordOwner.id}/change-password`, { password });
      setIssuedPassword({ owner: passwordOwner.name, login: passwordOwner.phone || passwordOwner.email || "", password });
      setPasswordOwner(null);
      setNewPassword("");
    } catch (err) {
      toast.show(errorMessage(err, "Не удалось сменить пароль"), { tone: "danger" });
    }
  }

  async function deleteOwner() {
    if (!ownerToDelete) return;
    await api.delete(`/admin/owners/${ownerToDelete.id}`);
    setOwnerToDelete(null);
    load();
  }

  return (
    <Page>
      <PageHeader
        title="Управление владельцами"
        description="Создавайте и просматривайте владельцев отдельно от магазинов."
        back={{ to: "/admin", label: "Назад в админку" }}
      />
      <div className={styles.columns}>
        <Card as="section" padding="lg">
          <CardHeader title="Создать владельца" />
          <form className={styles.form} onSubmit={createOwner}>
            <Field label="Имя" required>
              <Input value={ownerForm.name} onChange={(e) => setOwnerForm({ ...ownerForm, name: e.target.value })} required />
            </Field>
            <Field label="Email">
              <Input value={ownerForm.email} onChange={(e) => setOwnerForm({ ...ownerForm, email: e.target.value })} />
            </Field>
            <Field label="Телефон">
              <Input type="tel" value={ownerForm.phone} placeholder="+79280123456" onChange={(e) => setOwnerForm({ ...ownerForm, phone: e.target.value })} />
            </Field>
            <Field label="Пароль" hint="Минимум 6 символов. «Придумать» даст 8 цифр — их легко продиктовать." required>
              <div className={styles.passwordRow}>
                <Input value={ownerForm.password} onChange={(e) => setOwnerForm({ ...ownerForm, password: e.target.value })} minLength={6} required />
                <Button variant="secondary" icon={Key01Icon} onClick={() => setOwnerForm({ ...ownerForm, password: generatePassword() })}>
                  Придумать
                </Button>
              </div>
            </Field>
            <Button type="submit" variant="primary" loading={isCreating}>
              Создать
            </Button>
          </form>
        </Card>
        <Card as="section" padding="lg">
          <CardHeader title="Список владельцев" />
          {owners.length ? (
            <div className={styles.list}>
              {owners.map((owner) => (
                <div className={styles.row} key={owner.id}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowIcon}>
                      <Icon icon={UserAccountIcon} size="md" strokeWidth={1.6} />
                    </span>
                    <div className={styles.rowText}>
                      <strong>{owner.name}</strong>
                      <small>{owner.email || owner.phone}</small>
                    </div>
                    <Menu
                      label={`Операции владельца ${owner.name}`}
                      items={[
                        { label: "Редактировать", icon: Edit02Icon, onSelect: () => openEditModal(owner) },
                        { label: "Сменить пароль", icon: LockKeyIcon, onSelect: () => setPasswordOwner(owner) },
                        { label: "Удалить владельца", icon: Delete02Icon, danger: true, onSelect: () => setOwnerToDelete(owner) }
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={UserAccountIcon} title="Владельцев пока нет" description="Создайте первого владельца в форме слева." />
          )}
        </Card>
      </div>

      {ownerToEdit && (
        <Modal
          title="Редактировать владельца"
          description={ownerToEdit.name}
          onClose={() => setOwnerToEdit(null)}
          closeOnBackdrop={false}
          onSubmit={updateOwner}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOwnerToEdit(null)}>
                Отмена
              </Button>
              <Button type="submit" variant="primary">
                Сохранить
              </Button>
            </>
          }
        >
          <Field label="Имя" required>
            <Input value={ownerEditForm.name} onChange={(e) => setOwnerEditForm({ ...ownerEditForm, name: e.target.value })} required />
          </Field>
          <Field label="Email">
            <Input value={ownerEditForm.email} onChange={(e) => setOwnerEditForm({ ...ownerEditForm, email: e.target.value })} />
          </Field>
          <Field label="Телефон">
            <Input type="tel" value={ownerEditForm.phone} onChange={(e) => setOwnerEditForm({ ...ownerEditForm, phone: e.target.value })} />
          </Field>
        </Modal>
      )}

      {passwordOwner && (
        <Modal
          size="sm"
          title="Сменить пароль"
          description={passwordOwner.name}
          onClose={() => setPasswordOwner(null)}
          closeOnBackdrop={false}
          onSubmit={changePassword}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPasswordOwner(null)}>
                Отмена
              </Button>
              <Button type="submit" variant="primary">
                Сохранить
              </Button>
            </>
          }
        >
          <Field label="Новый пароль" hint="Минимум 6 символов" required>
            <div className={styles.passwordRow}>
              <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} required autoComplete="off" />
              <Button variant="secondary" icon={Key01Icon} onClick={() => setNewPassword(generatePassword())}>
                Придумать
              </Button>
            </div>
          </Field>
        </Modal>
      )}

      {issuedPassword && (
        <Modal
          size="sm"
          title="Передайте владельцу"
          description={issuedPassword.owner}
          onClose={() => setIssuedPassword(null)}
          footer={
            <>
              <Button
                variant="secondary"
                icon={Copy01Icon}
                onClick={() =>
                  copy(
                    [issuedPassword.login && `Логин: ${issuedPassword.login}`, `Пароль: ${issuedPassword.password}`, `Вход: ${location.origin}/login`].filter(Boolean).join("\n"),
                    "Данные для входа скопированы"
                  )
                }
              >
                Скопировать
              </Button>
              <Button variant="primary" onClick={() => setIssuedPassword(null)}>
                Готово
              </Button>
            </>
          }
        >
          {issuedPassword.login && (
            <div className={styles.credential}>
              <span>Логин</span>
              <strong>{issuedPassword.login}</strong>
            </div>
          )}
          <div className={styles.credential}>
            <span>Пароль</span>
            <strong className={styles.password}>{formatForDictation(issuedPassword.password)}</strong>
          </div>
          <p className={styles.credentialHint}>Пароль больше не будет показан. Владелец сможет сменить его в разделе «Аккаунт».</p>
        </Modal>
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
    </Page>
  );
}
