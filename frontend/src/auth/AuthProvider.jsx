import { createContext, useContext, useState } from 'react';
import { getUserFromStorage, setUserToStorage, removeUserFromStorage } from '../utils/storage';
const AuthContext = createContext();
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(getUserFromStorage());
  const login = (u) => { setUser(u); setUserToStorage(u); };
  const logout = () => { setUser(null); removeUserFromStorage(); };
  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => useContext(AuthContext);
