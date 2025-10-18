import { useAuth } from '../auth/AuthProvider';
export default function Profile(){
  const { user } = useAuth();
  if(!user) return <p>请先登录</p>;
  return (<div><h2>个人资料</h2><p>用户名: {user.username}</p><p>邮箱: {user.email}</p></div>);
}
