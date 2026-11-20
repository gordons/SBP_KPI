import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="login">
      <section className="login-brand">
        <h1>KPI &amp; Insentif SBP</h1>
        <p>Upload data bulanan, aplikasi menghitung KPI dan insentif setiap karyawan toko.</p>
      </section>
      <section className="login-form">
        <LoginForm />
      </section>
    </main>
  );
}
