'use client';

export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="grid size-9 place-items-center rounded-full bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-700"
        aria-label="Sign out"
        title="Sign out"
      >
        MV
      </button>
    </form>
  );
}
