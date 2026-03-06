export function validatePasswordPolicy(password: string) {
  if (password.length < 10) {
    return "Password minimal 10 karakter";
  }

  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return "Password harus mengandung huruf besar dan kecil";
  }

  if (!/\d/.test(password)) {
    return "Password harus mengandung angka";
  }

  return null;
}
