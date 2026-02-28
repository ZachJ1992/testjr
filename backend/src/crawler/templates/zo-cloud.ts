/**
 * zo-cloud TMS 爬虫模板
 * 
 * 适用于 zo-cloud 物流管理系统（如 tms.zo-cloud.com）
 * 登录页面包含：公司ID、用户名、密码
 * 数据页面：/Schedule/taskList
 */

import { Page } from 'puppeteer-core';
import { 
  CrawlerTemplate, 
  CrawlerRuntimeConfig, 
  WaybillData,
  commonLoginFields,
  registerCrawlerTemplate 
} from '../crawler-templates.js';

// ==================== 全局状态 ====================
let interceptedApiData: any[] = [];
let tmsTotalRecords: number = 0;

// ==================== API 数据映射 ====================
function mapApiDataToRow(item: any): any {
  return {
    waybillNumber: item.car_batch || item.batchNumber || item.batch_number || '',
    createdTime: item.create_time || item.createTime || '',
    driverName: item.b_dr_name || item.driverName || '',
    vehiclePlate: item.b_tr_num || item.vehiclePlate || '',
    departurePlace: item.load_addr || item.route_text?.split('->')[0]?.trim() || '',
    arrivalPlace: item.unload_addr || item.route_text?.split('->').pop()?.trim() || '',
    receivableTotal: parseFloat(item.receivable_total) || 0,
    payableTotal: parseFloat(item.b_arr_f) + parseFloat(item.b_fuel_card_f || 0) || 0,
    status: item.batch_st || '',
    remark: item.b_remark || '',
    rawData: item,
  };
}

// ==================== 登录逻辑 ====================
async function login(page: Page, config: CrawlerRuntimeConfig): Promise<boolean> {
  console.log(`[zo-cloud] 开始登录 - 公司ID: ${config.companyId}, 用户名: ${config.username}`);
  
  // 尝试多个可能的登录URL
  const loginUrls = [
    config.loginUrl + '/tms/login',
    config.loginUrl + '/Login',
    config.loginUrl + '/login',
    config.loginUrl + '/user/login',
    config.loginUrl + '/#/login',
    config.loginUrl,
  ];
  
  let loginPageFound = false;
  
  for (const loginUrl of loginUrls) {
    console.log(`[zo-cloud] 尝试访问: ${loginUrl}`);
    try {
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const inputs = await page.$$('input');
      console.log(`[zo-cloud] 在 ${loginUrl} 找到 ${inputs.length} 个输入框`);
      
      if (inputs.length >= 2) {
        loginPageFound = true;
        console.log(`[zo-cloud] 找到登录页面: ${loginUrl}`);
        break;
      }
      
      // 检查是否已经登录
      const currentUrl = page.url();
      if (currentUrl.includes('/Index/Home') || currentUrl.includes('/home') || currentUrl.includes('/dashboard')) {
        console.log('[zo-cloud] 已经登录，无需重新登录');
        return true;
      }
    } catch (e: any) {
      console.log(`[zo-cloud] 访问 ${loginUrl} 失败: ${e.message}`);
    }
  }
  
  // 如果没有找到登录页面，尝试点击"开始体验"按钮
  if (!loginPageFound) {
    console.log('[zo-cloud] 直接URL未找到登录页，尝试点击"开始体验"按钮...');
    await page.goto(config.loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      const startButtonClicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, a.btn, a[class*="button"], span[class*="button"]');
        for (const btn of buttons) {
          const text = (btn.textContent || '').trim();
          if (text === '开始体验' || text === '进入系统' || text === '登录' || text === '进入') {
            (btn as HTMLElement).click();
            return text;
          }
        }
        return null;
      });
      
      if (startButtonClicked) {
        console.log(`[zo-cloud] 已点击"${startButtonClicked}"按钮，等待登录页加载...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (e) {
      console.log('[zo-cloud] 未找到"开始体验"按钮');
    }
  }
  
  // 查找并填写登录表单
  let loginFormFound = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[zo-cloud] 尝试查找登录表单 (第${attempt}次)...`);
    
    const inputs = await page.$$('input[type="text"], input[type="password"], input:not([type])');
    console.log(`[zo-cloud] 找到 ${inputs.length} 个输入框`);
    
    if (inputs.length >= 3) {
      loginFormFound = true;
      
      // 填写公司ID
      console.log(`[zo-cloud] 填写公司ID: ${config.companyId}`);
      await inputs[0].click({ clickCount: 3 });
      await inputs[0].type(config.companyId, { delay: 50 });
      
      // 填写用户名
      console.log(`[zo-cloud] 填写用户名: ${config.username}`);
      await inputs[1].click({ clickCount: 3 });
      await inputs[1].type(config.username, { delay: 50 });
      
      // 填写密码
      console.log('[zo-cloud] 填写密码');
      await inputs[2].click({ clickCount: 3 });
      await inputs[2].type(config.password, { delay: 50 });
      
      break;
    } else if (inputs.length >= 2) {
      loginFormFound = true;
      
      // 可能没有公司ID字段
      console.log(`[zo-cloud] 填写用户名: ${config.username}`);
      await inputs[0].click({ clickCount: 3 });
      await inputs[0].type(config.username, { delay: 50 });
      
      console.log('[zo-cloud] 填写密码');
      await inputs[1].click({ clickCount: 3 });
      await inputs[1].type(config.password, { delay: 50 });
      
      break;
    }
    
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  if (!loginFormFound) {
    console.log('[zo-cloud] 未找到登录表单');
    return false;
  }
  
  // 点击登录按钮
  console.log('[zo-cloud] 查找并点击登录按钮...');
  const loginClicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, [type="submit"], .btn, [class*="button"]');
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      if (text.includes('登录') || text.includes('Login') || text.includes('立即登录')) {
        (btn as HTMLElement).click();
        return text;
      }
    }
    const form = document.querySelector('form');
    if (form) {
      form.submit();
      return 'form-submit';
    }
    return null;
  });
  
  if (loginClicked) {
    console.log(`[zo-cloud] 已点击登录按钮: ${loginClicked}`);
  }
  
  // 等待登录完成
  console.log('[zo-cloud] 等待登录完成和页面跳转...');
  let loginSuccess = false;
  const startUrl = page.url();
  
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const currentUrl = page.url();
    
    if (currentUrl !== startUrl) {
      console.log(`[zo-cloud] 检测到URL变化: ${currentUrl}`);
    }
    
    if (currentUrl.includes('/Index/Home') || 
        currentUrl.includes('/Schedule') || 
        currentUrl.includes('/dashboard')) {
      console.log(`[zo-cloud] 登录成功！跳转到: ${currentUrl}`);
      loginSuccess = true;
      break;
    }
    
    // 检查是否有登录错误提示
    const hasError = await page.evaluate(() => {
      const errorElements = document.querySelectorAll('.el-message--error, .error, [class*="error"]');
      for (const el of errorElements) {
        const text = (el.textContent || '').trim();
        if (text.length > 0 && text.length < 100) {
          return text;
        }
      }
      return null;
    });
    
    if (hasError) {
      console.log(`[zo-cloud] 登录错误: ${hasError}`);
      break;
    }
  }
  
  if (!loginSuccess) {
    // 尝试直接访问主页
    console.log('[zo-cloud] 尝试直接访问主页...');
    try {
      await page.goto(config.loginUrl + '/Index/Home', { waitUntil: 'networkidle2', timeout: 15000 });
      const newUrl = page.url();
      
      if (newUrl.includes('/Index/Home') || newUrl.includes('/Schedule')) {
        console.log('[zo-cloud] 直接访问主页成功！');
        loginSuccess = true;
      }
    } catch (e: any) {
      console.log(`[zo-cloud] 直接访问主页失败: ${e.message}`);
    }
  }
  
  return loginSuccess;
}

// ==================== 数据获取逻辑 ====================
async function fetchData(page: Page, config: CrawlerRuntimeConfig, maxPages: number): Promise<any[]> {
  console.log('[zo-cloud] 开始获取数据...');
  
  // 重置拦截数据
  interceptedApiData = [];
  tmsTotalRecords = 0;
  
  // 设置 API 拦截
  await page.setRequestInterception(true);
  
  page.on('request', request => {
    request.continue();
  });
  
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('batchList') || url.includes('Batch/list') || url.includes('taskList')) {
      try {
        const text = await response.text();
        const data = JSON.parse(text);
        
        if (data.data && Array.isArray(data.data.datas)) {
          console.log(`[zo-cloud] 拦截到 API 数据: ${data.data.datas.length} 条`);
          interceptedApiData.push(...data.data.datas);
          tmsTotalRecords = data.data.total || tmsTotalRecords;
        } else if (data.datas && Array.isArray(data.datas)) {
          console.log(`[zo-cloud] 拦截到 API 数据: ${data.datas.length} 条`);
          interceptedApiData.push(...data.datas);
          tmsTotalRecords = data.total || tmsTotalRecords;
        }
      } catch (e) {
        // 忽略非 JSON 响应
      }
    }
  });
  
  // 访问任务列表页面
  const taskListUrl = config.loginUrl + '/Schedule/taskList';
  console.log(`[zo-cloud] 访问任务列表: ${taskListUrl}`);
  
  await page.goto(taskListUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // 设置日期范围为过去6个月（通过点击快捷按钮）
  console.log('[zo-cloud] 尝试设置日期范围...');
  try {
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, span, a');
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim();
        if (text === '近半年' || text === '半年' || text === '6个月') {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
  } catch (e) {
    console.log('[zo-cloud] 日期设置失败，使用默认范围');
  }
  
  // 获取初始数据
  console.log('[zo-cloud] 等待初始数据加载...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const allData: any[] = [];
  let currentPage = 1;
  
  // 分页获取数据
  while (currentPage <= maxPages) {
    console.log(`[zo-cloud] 处理第 ${currentPage} 页...`);
    
    // 等待数据加载
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 获取当前页数据
    const pageData = [...interceptedApiData];
    interceptedApiData = [];
    
    if (pageData.length > 0) {
      console.log(`[zo-cloud] 第 ${currentPage} 页获取到 ${pageData.length} 条数据`);
      allData.push(...pageData);
    } else if (currentPage > 1) {
      console.log(`[zo-cloud] 第 ${currentPage} 页无数据，停止翻页`);
      break;
    }
    
    // 尝试翻到下一页
    const hasNextPage = await page.evaluate((pageNum) => {
      // 直接跳转到指定页
      const pageInput = document.querySelector('input[class*="pager"], input[type="number"]') as HTMLInputElement;
      if (pageInput) {
        pageInput.value = String(pageNum + 1);
        pageInput.dispatchEvent(new Event('input', { bubbles: true }));
        pageInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // 查找确认按钮
        const confirmBtns = document.querySelectorAll('button');
        for (const btn of confirmBtns) {
          if ((btn.textContent || '').includes('跳转') || (btn.textContent || '').includes('确定')) {
            btn.click();
            return true;
          }
        }
        
        // 按回车
        pageInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return true;
      }
      
      // 点击下一页按钮
      const nextBtns = document.querySelectorAll('button, a, span');
      for (const btn of nextBtns) {
        const text = (btn.textContent || '').trim();
        if (text === '>' || text === '下一页' || text === 'Next' || (btn as HTMLElement).classList.contains('btn-next')) {
          if (!(btn as HTMLButtonElement).disabled) {
            (btn as HTMLElement).click();
            return true;
          }
        }
      }
      
      return false;
    }, currentPage);
    
    if (!hasNextPage) {
      console.log(`[zo-cloud] 没有更多页面`);
      break;
    }
    
    currentPage++;
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log(`[zo-cloud] 数据获取完成，共 ${allData.length} 条`);
  return allData;
}

// ==================== 字段映射逻辑 ====================
function mapFields(rawData: any): WaybillData {
  const item = rawData.rawData || rawData;
  
  // 状态映射
  const statusMap: Record<string, string> = {
    '0': 'cancelled',
    '1': 'pending',
    '2': 'in_transit',
    '3': 'delivered',
    '4': 'completed',
    '10': 'pending',
  };
  
  // 从 route_text 提取出发地和目的地
  let departurePlace = '';
  let arrivalPlace = '';
  if (item.route_text) {
    const parts = item.route_text.split('->');
    if (parts.length >= 2) {
      departurePlace = parts[0].trim();
      arrivalPlace = parts[parts.length - 1].trim();
    }
  }
  
  if (item.load_addr) departurePlace = item.load_addr;
  if (item.unload_addr) arrivalPlace = item.unload_addr;
  
  return {
    waybillNumber: String(item.car_batch || item.batchNumber || item.batch_number || '').trim(),
    externalId: String(item.id || ''),
    senderName: '',
    senderAddress: departurePlace,
    receiverName: '',
    receiverAddress: arrivalPlace,
    goodsName: '',
    weight: 0,
    volume: parseFloat(item.tt_volume) || 0,
    freight: parseFloat(item.receivable_trans_f) || parseFloat(item.receivable_total) || 0,
    receivableTotal: parseFloat(item.receivable_total) || 0,
    payableTotal: (parseFloat(item.b_arr_f) || 0) + (parseFloat(item.b_fuel_card_f) || 0),
    status: statusMap[item.batch_st] || 'pending',
    remark: String(item.b_remark || ''),
    createTime: item.create_time ? new Date(item.create_time) : undefined,
    shipTime: item.truck_t ? new Date(item.truck_t) : undefined,
    
    // 额外字段
    driverName: item.b_dr_name || '',
    vehiclePlate: item.b_tr_num || '',
    vehicleRoute: item.route_text || '',
    departurePlace,
    arrivalPlace,
  };
}

// ==================== 模板定义 ====================
const zoCloudTemplate: CrawlerTemplate = {
  id: 'zo-cloud',
  name: 'zo-cloud TMS',
  description: 'zo-cloud 物流管理系统，适用于 tms.zo-cloud.com 等域名',
  requiredFields: [
    { 
      key: 'loginUrl', 
      label: '登录地址', 
      type: 'text', 
      required: true,
      placeholder: '例如: https://tms.zo-cloud.com',
      defaultValue: 'https://tms.zo-cloud.com'
    },
    { 
      key: 'companyId', 
      label: '公司ID', 
      type: 'text', 
      required: true,
      placeholder: '在TMS系统中的公司标识'
    },
    { 
      key: 'username', 
      label: '用户名', 
      type: 'text', 
      required: true,
      placeholder: '登录用户名'
    },
    { 
      key: 'password', 
      label: '密码', 
      type: 'password', 
      required: true,
      placeholder: '登录密码'
    },
  ],
  login,
  fetchData,
  mapFields,
};

// ==================== 注册模板 ====================
registerCrawlerTemplate(zoCloudTemplate);

export default zoCloudTemplate;
