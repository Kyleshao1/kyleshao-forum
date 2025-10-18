import { useState } from 'react';
import api from '../api';
export default function ForgotPassword(){
  const [email,setEmail]=useState(''); const [msg,setMsg]=useState('');
  const submit=async (e)=>{ e.preventDefault(); try{ await api.post('/auth/forgot-password',{email}); setMsg('重置邮件已发送'); }catch{ setMsg('发送失败'); } };
  return (<div><h2>忘记密码</h2><form onSubmit={submit}><input placeholder='邮箱' value={email} onChange={e=>setEmail(e.target.value)} /><button type='submit'>发送</button></form><p>{msg}</p></div>);
}
