import useAuthStore from "../../store/authStore";

function ExampleActions() {
  const { user, hasAuthority } = useAuthStore();

  const canManageAccounts = hasAuthority(["manager", "admin"]);

  const canManageAuthorities = hasAuthority(["admin"]);

  return (
    <div>
      {canManageAccounts && <button type="button">Manage Accounts</button>}

      {canManageAuthorities && <button type="button">Change Authority</button>}

      <span>Current authority: {user?.authority_level || "user"}</span>
    </div>
  );
}
