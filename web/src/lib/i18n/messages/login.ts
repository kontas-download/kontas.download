import type { Namespace } from './types';

const login: Namespace = {
  lt: {
    subtitle: "Prisijungimas prie buhalterinės apskaitos ir ERP sistemos",
    email: "El. paštas",
    password: "Slaptažodis",
    checking: "Tikrinama…",
    submit: "Prisijungti",
    loginFailed: "Prisijungimo klaida",
    networkError: "Tinklo arba serverio klaida",
    shareNotice: "Prisijunkite ir pakartokite dalinimąsi: failai dar nebuvo išsaugoti.",
  },
  ru: {
    subtitle: "Вход в систему бухгалтерского учёта и ERP",
    email: "Email",
    password: "Пароль",
    checking: "Проверка…",
    submit: "Войти в систему",
    loginFailed: "Ошибка входа",
    networkError: "Ошибка сети или сервера",
    shareNotice: "Войдите и повторите отправку: файлы ещё не сохранены.",
  },
  en: {
    subtitle: "Sign in to the accounting and ERP system",
    email: "Email",
    password: "Password",
    checking: "Checking…",
    submit: "Sign in",
    loginFailed: "Sign-in failed",
    networkError: "Network or server error",
    shareNotice: "Sign in and share again: the files have not been saved yet.",
  },
};
export default login;
