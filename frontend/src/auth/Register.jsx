import { useState } from 'react';
import api from '../api';
import { useNavigate } from 'react-router-dom';

export default function Register(){
  const nav = useNavigate();
  const [form, setForm] = useState({ username:'', email:'', password:'' });
  const [msg, setMsg] = useState('');
  const handle = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/register', form);
      setMsg('注册成功，请查收验证邮件');
      nav('/login');
    } catch (err) { setMsg(err.response?.data?.message || '注册失败'); }
  };
  return (<div><h2>注册</h2><form onSubmit={handle}><input placeholder='用户名' value={form.username} onChange={e=>setForm({...form,username:e.target.value})} /><br/><input placeholder='邮箱' value={form.email} onChange={e=>setForm({...form,email:e.target.value})} /><br/><input type='password' placeholder='密码' value={form.password} onChange={e=>setForm({...form,password:e.target.value})} /><br/><button type='submit'>注册</button></form><p>{msg}</p></div>);
}
