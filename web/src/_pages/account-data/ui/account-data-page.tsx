import { AccountShell } from '@/widgets/account-shell';

// "Мои данные" (spec 0017 U5): `/customer/account`, for now its title only.
export function AccountDataPage() {
  return <AccountShell section="data" />;
}
