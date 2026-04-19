export async function runLogout({
  remoteLogout,
  clearSession,
  navigateToLogin,
}) {
  try {
    if (typeof remoteLogout === 'function') {
      await remoteLogout()
    }
  } catch (_) {
    // Local logout must still complete even if backend logout fails.
  }

  if (typeof clearSession === 'function') {
    clearSession()
  }

  if (typeof navigateToLogin === 'function') {
    navigateToLogin()
  }
}
