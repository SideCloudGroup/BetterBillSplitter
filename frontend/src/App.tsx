import {App as AntdApp, Button, ConfigProvider, Result} from 'antd';

import zhCN from 'antd/locale/zh_CN';

import {HashRouter, Link, Navigate, Outlet, Route, Routes} from 'react-router-dom';

import {AuthProvider, useAuth} from '@/context/AuthContext';
import {SiteProvider} from '@/context/SiteContext';

import {PrivateRoute} from '@/components/PrivateRoute';

import {MainLayout} from '@/components/MainLayout';

import {LoginPage} from '@/pages/LoginPage';

import {RegisterPage} from '@/pages/RegisterPage';

import {MfaPage} from '@/pages/MfaPage';

import {HomePage} from '@/pages/HomePage';

import {BillsPage} from '@/pages/BillsPage';

import {PaymentListPage} from '@/pages/PaymentListPage';

import {PaymentPartyPage} from '@/pages/PaymentPartyPage';

import {ItemListPage, ItemPartyPage} from '@/pages/ItemPages';

import {ItemAddPage} from '@/pages/ItemAddPage';

import {PartyListPage} from '@/pages/parties/PartyListPage';

import {PartyJoinPage} from '@/pages/parties/PartyJoinPage';

import {PartyCreatePage} from '@/pages/parties/PartyCreatePage';

import {PartyShowPage} from '@/pages/parties/PartyShowPage';

import {PartyEditPage} from '@/pages/parties/PartyEditPage';

import {PartyBestPayPage} from '@/pages/parties/PartyBestPayPage';

import {PartyMembersPage} from '@/pages/parties/PartyMembersPage';

import {ProfilePage} from '@/pages/ProfilePage';

import {
  AdminCurrenciesPage,
  AdminCurrencyEditPage,
  AdminHomePage,
  AdminPartiesPage,
  AdminPartyMembersPage,
  AdminSettingsPage,
  AdminUsersPage,
} from '@/pages/admin/AdminPages';

import {appTheme} from '@/theme/appTheme';


function AdminGate() {

  const {user} = useAuth();

  if (!user?.is_admin) {

    return (

      <Result

        status="403"

        title="无权限"

        subTitle="需要管理员权限。"

        extra={

          <Link to="/">

            <Button type="primary">返回概览</Button>

          </Link>

        }

      />

    );

  }

  return <Outlet/>;

}


function NotFoundPage() {

  const loc = window.location.hash.slice(1) || '/';

  return (

    <Result

      status="404"

      title="未找到页面"

      subTitle={loc}

      extra={

        <Link to="/">

          <Button type="primary">返回概览</Button>

        </Link>

      }

    />

  );

}


export function App() {

  return (

    <ConfigProvider locale={zhCN} theme={appTheme}>

      <AntdApp>

        <HashRouter>

          <SiteProvider>

            <AuthProvider>

              <Routes>

                <Route path="/login" element={<LoginPage/>}/>

                <Route path="/auth/login" element={<Navigate to="/login" replace/>}/>

                <Route path="/register" element={<RegisterPage/>}/>

                <Route path="/mfa" element={<MfaPage/>}/>

                <Route

                  element={

                    <PrivateRoute>

                      <MainLayout/>

                    </PrivateRoute>

                  }

                >

                  <Route index element={<HomePage/>}/>

                  <Route path="bills" element={<BillsPage/>}/>

                  <Route path="payment" element={<PaymentListPage/>}/>

                  <Route path="payment/party/:partyId" element={<PaymentPartyPage/>}/>

                  <Route path="items" element={<ItemListPage/>}/>

                  <Route path="items/party/:partyId" element={<ItemPartyPage/>}/>

                  <Route path="items/add" element={<ItemAddPage/>}/>

                  <Route path="parties" element={<PartyListPage/>}/>

                  <Route path="parties/join" element={<PartyJoinPage/>}/>

                  <Route path="parties/create" element={<PartyCreatePage/>}/>

                  <Route path="parties/:id/members" element={<PartyMembersPage/>}/>

                  <Route path="parties/:id/edit" element={<PartyEditPage/>}/>

                  <Route path="parties/:id/bestpay" element={<PartyBestPayPage/>}/>

                  <Route path="parties/:id" element={<PartyShowPage/>}/>

                  <Route path="profile" element={<ProfilePage/>}/>

                  <Route path="admin" element={<AdminGate/>}>

                    <Route index element={<AdminHomePage/>}/>

                    <Route path="users" element={<AdminUsersPage/>}/>

                    <Route path="parties" element={<AdminPartiesPage/>}/>

                    <Route path="parties/:id/members" element={<AdminPartyMembersPage/>}/>

                    <Route path="currencies" element={<AdminCurrenciesPage/>}/>

                    <Route path="currencies/edit/:code" element={<AdminCurrencyEditPage/>}/>

                    <Route path="settings" element={<AdminSettingsPage/>}/>

                  </Route>

                  <Route path="*" element={<NotFoundPage/>}/>

                </Route>

              </Routes>

            </AuthProvider>

          </SiteProvider>

        </HashRouter>

      </AntdApp>

    </ConfigProvider>

  );

}

