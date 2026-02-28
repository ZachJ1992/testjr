/**
 * 拼音匹配工具
 * 支持拼音和拼音首字母匹配
 */
// 导入 pinyin-match 库
import Pinyin from 'pinyin-match';
const match = Pinyin.match;
/**
 * 检查文本是否匹配搜索关键词（支持拼音、首字母和普通文本）
 * @param text 要搜索的文本
 * @param keyword 搜索关键词
 * @returns 是否匹配
 */
export function matchText(text, keyword) {
    if (!text || !keyword)
        return false;
    const lowerText = text.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    // 1. 普通文本匹配（不区分大小写）
    if (lowerText.includes(lowerKeyword)) {
        return true;
    }
    // 2. 使用 pinyin-match 库进行拼音匹配
    try {
        const result = match(text, keyword);
        if (result !== false) {
            return true;
        }
    }
    catch (e) {
        // 匹配失败，继续返回 false
        console.debug('pinyin-match failed:', e);
    }
    return false;
}
