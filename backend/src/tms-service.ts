/**
 * TMS (运输管理系统) 对接服务
 * 
 * 负责与外部TMS系统的付款码同步
 */

const TMS_BASE_URL = process.env.TMS_BASE_URL || "http://tms-api.example.com";
const TMS_API_KEY = process.env.TMS_API_KEY || "";
const TMS_PLATFORM_CODE = process.env.TMS_PLATFORM_CODE || "DENGTU";

export interface TmsSyncResult {
  success: boolean;
  tmsCodeId?: string;
  error?: string;
}

export interface PaymentCodeInfo {
  code: string;
  amount: number;
  expireAt: string;
  driverId?: string;
  driverPhone?: string;
  waybillNumber?: string;
  categoryName: string;
  remark?: string;
}

/**
 * 推送付款码到 TMS 系统
 */
export async function syncPaymentCodeToTms(paymentCode: PaymentCodeInfo): Promise<TmsSyncResult> {
  // 如果没有配置TMS，模拟成功
  if (!TMS_API_KEY || TMS_BASE_URL === "http://tms-api.example.com") {
    console.log("[TMS Mock] Syncing payment code:", paymentCode.code);
    return {
      success: true,
      tmsCodeId: `tms_mock_${Date.now()}`,
    };
  }

  try {
    const response = await fetch(`${TMS_BASE_URL}/api/payment-codes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": TMS_API_KEY,
      },
      body: JSON.stringify({
        platformCode: TMS_PLATFORM_CODE,
        driverId: paymentCode.driverId,
        driverPhone: paymentCode.driverPhone,
        paymentCode: paymentCode.code,
        amount: paymentCode.amount,
        expireAt: paymentCode.expireAt,
        waybillNumber: paymentCode.waybillNumber,
        categoryName: paymentCode.categoryName,
        remark: paymentCode.remark,
      }),
    });

    const data = await response.json() as any;
    
    if (data.success) {
      return {
        success: true,
        tmsCodeId: data.data?.tmsCodeId,
      };
    } else {
      return {
        success: false,
        error: data.error || "TMS同步失败",
      };
    }
  } catch (error: any) {
    console.error("[TMS Error] Failed to sync payment code:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 查询TMS中的付款码状态
 */
export async function queryPaymentCodeFromTms(code: string): Promise<{
  success: boolean;
  status?: "active" | "used" | "expired" | "cancelled";
  usedAt?: string;
  error?: string;
}> {
  // 如果没有配置TMS，模拟响应
  if (!TMS_API_KEY || TMS_BASE_URL === "http://tms-api.example.com") {
    console.log("[TMS Mock] Query payment code:", code);
    return {
      success: true,
      status: "active",
    };
  }

  try {
    const response = await fetch(`${TMS_BASE_URL}/api/payment-codes/${code}`, {
      headers: {
        "X-API-Key": TMS_API_KEY,
      },
    });

    const data = await response.json() as any;
    
    if (data.success) {
      return {
        success: true,
        status: data.data?.status,
        usedAt: data.data?.usedAt,
      };
    } else {
      return {
        success: false,
        error: data.error || "查询失败",
      };
    }
  } catch (error: any) {
    console.error("[TMS Error] Failed to query payment code:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 处理TMS回调 - 付款码状态变更
 */
export interface TmsCallbackPayload {
  paymentCode: string;
  status: "used" | "expired" | "cancelled";
  usedAt?: string;
  usedLocation?: string;
}

/**
 * 验证TMS回调签名
 */
export function verifyTmsCallback(signature: string, payload: TmsCallbackPayload): boolean {
  // 简单验证，实际应该使用 HMAC 签名
  if (!TMS_API_KEY) return true; // 未配置时允许所有回调
  
  // TODO: 实现真实的签名验证
  return true;
}

/**
 * 取消TMS中的付款码
 */
export async function cancelPaymentCodeInTms(code: string): Promise<TmsSyncResult> {
  // 如果没有配置TMS，模拟成功
  if (!TMS_API_KEY || TMS_BASE_URL === "http://tms-api.example.com") {
    console.log("[TMS Mock] Cancel payment code:", code);
    return { success: true };
  }

  try {
    const response = await fetch(`${TMS_BASE_URL}/api/payment-codes/${code}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": TMS_API_KEY,
      },
    });

    const data = await response.json() as any;
    
    if (data.success) {
      return { success: true };
    } else {
      return {
        success: false,
        error: data.error || "取消失败",
      };
    }
  } catch (error: any) {
    console.error("[TMS Error] Failed to cancel payment code:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}
