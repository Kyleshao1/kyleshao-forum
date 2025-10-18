export const getUserFromStorage = () => {
  try { return JSON.parse(localStorage.getItem('forum_user')); } catch { return null; }
};
export const setUserToStorage = (u) => localStorage.setItem('forum_user', JSON.stringify(u));
export const removeUserFromStorage = () => localStorage.removeItem('forum_user');
