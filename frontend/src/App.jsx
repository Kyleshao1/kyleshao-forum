import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import Post from './pages/Post';
import Profile from './pages/Profile';
import Login from './auth/Login';
import Register from './auth/Register';
import Verify from './auth/Verify';
import ForgotPassword from './auth/ForgotPassword';
import ResetPassword from './auth/ResetPassword';
import { AuthProvider } from './auth/AuthProvider';
import React, { useEffect, useState } from 'react';

export default function App(){
  return (
    <BrowserRouter>
      <AuthProvider>
        <Header />
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/post/:id' element={<Post />} />
          <Route path='/profile' element={<Profile />} />
          <Route path='/login' element={<Login />} />
          <Route path='/register' element={<Register />} />
          <Route path='/verify' element={<Verify />} />
          <Route path='/forgot' element={<ForgotPassword />} />
          <Route path='/reset' element={<ResetPassword />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
