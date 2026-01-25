import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "dayjs/locale/en";
import customParseFormat from "dayjs/plugin/customParseFormat";
import localeData from "dayjs/plugin/localeData";

dayjs.extend(customParseFormat);
dayjs.extend(localeData);

export function getDayjsLocale(lang: string): string {
  return lang === "zh-CN" ? "zh-cn" : "en";
}

export function formatDate(date: string | Date | dayjs.Dayjs | null | undefined, format: string, lang: string = "zh-CN"): string {
  if (!date) return "-";
  const locale = getDayjsLocale(lang);
  return dayjs(date).locale(locale).format(format);
}

export function formatDateTime(date: string | Date | dayjs.Dayjs | null | undefined, lang: string = "zh-CN"): string {
  const format = lang === "zh-CN" ? "YYYY-MM-DD HH:mm:ss" : "MM/DD/YYYY HH:mm:ss";
  return formatDate(date, format, lang);
}

export function formatDateOnly(date: string | Date | dayjs.Dayjs | null | undefined, lang: string = "zh-CN"): string {
  const format = lang === "zh-CN" ? "YYYY-MM-DD" : "MM/DD/YYYY";
  return formatDate(date, format, lang);
}

export function formatDateRange(start: string | Date | dayjs.Dayjs | null | undefined, end: string | Date | dayjs.Dayjs | null | undefined, lang: string = "zh-CN"): string {
  const connector = lang === "zh-CN" ? " 至 " : " to ";
  const startStr = formatDateOnly(start, lang);
  const endStr = formatDateOnly(end, lang);
  return `${startStr}${connector}${endStr}`;
}

export function setDayjsLocale(lang: string): void {
  dayjs.locale(getDayjsLocale(lang));
}

