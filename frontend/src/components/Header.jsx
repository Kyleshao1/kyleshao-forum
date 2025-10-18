import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
export default function Header(){
  const { user, logout } = useAuth();
  return (<nav><Link to='/'>首页</Link> | {user ? (<span>{user.username} <button onClick={logout}>退出</button></span>) : (<span><Link to='/login'>登录</Link> <Link to='/register'>注册</Link></span>) }</nav>);
}
