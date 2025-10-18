import { useState } from 'react';
import api from '../api';
import { useSearchParams } from 'react-router-dom';
export default function ResetPassword(){
  const [params]=useSearchParams(); const token=params.get('token');
  const [pw,setPw]=useState(''); const [msg,setMsg]=useState('');
  const submit=async(e)=>{ e.preventDefault(); try{ await api.post('/auth/reset-password',{token,password:pw}); setMsg('密码已重置'); }catch{ setMsg('重置失败'); } };
  return (<div><h2>重置密码</h2><form onSubmit={submit}><input type='password' placeholder='新密码' value={pw} onChange={e=>setPw(e.target.value)} /><button type='submit'>提交</button></form><p>{msg}</p></div>);
}
