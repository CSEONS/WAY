import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { AdminPackage } from "../types/models";

/** Every package for the admin panel, hidden ones too: they can still be sold. Undefined while loading, null on an error. */
export function useAdminPackages() {
  const [packages, setPackages] = useState<AdminPackage[] | null>();

  const reload = useCallback(() => {
    api
      .get<AdminPackage[]>("/admin/packages")
      .then((res) => setPackages(res.data))
      .catch(() => setPackages(null));
  }, []);

  useEffect(reload, [reload]);

  return { packages, setPackages, reload };
}
