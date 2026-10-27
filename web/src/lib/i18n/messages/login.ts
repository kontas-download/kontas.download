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
  },
  ru: {
    subtitle: "Вход в систему бухгалтерского учёта и ERP",
    email: "Email",
    password: "Пароль",
    checking: "Проверка…",
    submit: "Войти в систему",
    loginFailed: "Ошибка входа",
    networkError: "Ошибка сети или сервера",
  },
  en: {
    subtitle: "Sign in to the accounting and ERP system",
    email: "Email",
    password: "Password",
    checking: "Checking…",
    submit: "Sign in",
    loginFailed: "Sign-in failed",
    networkError: "Network or server error",
  },
};
export default login;
