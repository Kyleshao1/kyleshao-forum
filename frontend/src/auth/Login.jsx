import { useState } from 'react';
import api from '../api';
import { useAuth } from './AuthProvider';
import { useNavigate } from 'react-router-dom';

export default function Login(){
  const { login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email:'', password:'' });
  const [msg, setMsg] = useState('');
  const handle = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/auth/login', form);
      login({ ...res.data.user, token: res.data.token });
      setMsg('登录成功');
      nav('/');
    } catch (err) { setMsg(err.response?.data?.message || '登录失败'); }
  };
  return (<div><h2>登录</h2><form onSubmit={handle}><input placeholder='邮箱' value={form.email} onChange={e=>setForm({...form,email:e.target.value})} /><br/><input type='password' placeholder='密码' value={form.password} onChange={e=>setForm({...form,password:e.target.value})} /><br/><button type='submit'>登录</button></form><p>{msg}</p></div>);
}
