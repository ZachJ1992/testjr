import type { RowDataPacket } from "mysql2";

import type { OrgContext } from "./auth.js";
import { pool } from "./db.js";
import { getDirectedPayContractsByFunder } from "./directed-pay-contracts-store.js";

export interface WaybillAccessScope {
  customerId?: string;
  customerIds?: string[];
  emptyResult?: boolean;
}

export interface WaybillOverviewFilters {
  customerName?: string;
  vehiclePlate?: string;
  batchStatus?: string;
  batchSource?: string;
  startDate?: string;
  endDate?: string;
  customerId?: string;
  customerIds?: string[];
  contractNumber?: string;
  businessMode?: string;
  status?: string;
  waybillNumber?: string;
}

export interface WaybillQueryParts {
  fromAndJoinSql: string;
  whereSql: string;
  params: Array<string>;
}

type FunderContractResolver = (
  funderId: string
) => Promise<Array<{ financierId: string }>>;

export async function resolveWaybillAccessScope(
  orgContext?: OrgContext,
  getContractsByFunder: FunderContractResolver = getDirectedPayContractsByFunder
): Promise<WaybillAccessScope> {
  if (!orgContext || orgContext.isPlatformUser) {
    return {};
  }

  if (orgContext.orgType === "financier") {
    return {
      customerId: orgContext.relatedEntityId,
    };
  }

  if (orgContext.orgType === "funder" && orgContext.relatedEntityId) {
    const contracts = await getContractsByFunder(orgContext.relatedEntityId);
    const customerIds = contracts.map((contract) => contract.financierId);

    if (customerIds.length === 0) {
      return {
        customerIds: [],
        emptyResult: true,
      };
    }

    return {
      customerIds,
    };
  }

  return {};
}

export async function getWaybillColumnNames(): Promise<Set<string>> {
  const [columns] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'waybills'`
  );

  return new Set(columns.map((column) => String(column.COLUMN_NAME)));
}

export function buildWaybillQueryParts(
  filters: WaybillOverviewFilters = {},
  scope: WaybillAccessScope = {},
  columnNames: Set<string>
): WaybillQueryParts {
  const whereConditions = ["w.deleted_at IS NULL"];
  const params: string[] = [];

  if (scope.customerId) {
    whereConditions.push("w.customer_id = ?");
    params.push(scope.customerId);
  }

  if (scope.customerIds && scope.customerIds.length > 0) {
    const placeholders = scope.customerIds.map(() => "?").join(",");
    whereConditions.push(`w.customer_id IN (${placeholders})`);
    params.push(...scope.customerIds);
  }

  if (filters.customerId) {
    whereConditions.push("w.customer_id = ?");
    params.push(filters.customerId);
  }

  if (filters.customerIds && filters.customerIds.length > 0) {
    const placeholders = filters.customerIds.map(() => "?").join(",");
    whereConditions.push(`w.customer_id IN (${placeholders})`);
    params.push(...filters.customerIds);
  }

  if (filters.customerName) {
    if (columnNames.has("project_name")) {
      whereConditions.push("(w.customer_name LIKE ? OR w.project_name LIKE ? OR f.enterprise_name LIKE ?)");
      params.push(`%${filters.customerName}%`, `%${filters.customerName}%`, `%${filters.customerName}%`);
    } else {
      whereConditions.push("(w.customer_name LIKE ? OR f.enterprise_name LIKE ?)");
      params.push(`%${filters.customerName}%`, `%${filters.customerName}%`);
    }
  }

  if (filters.vehiclePlate) {
    whereConditions.push("w.vehicle_plate LIKE ?");
    params.push(`%${filters.vehiclePlate}%`);
  }

  if (filters.batchStatus && columnNames.has("batch_status")) {
    whereConditions.push("w.batch_status = ?");
    params.push(filters.batchStatus);
  }

  if (filters.batchSource && columnNames.has("batch_source")) {
    whereConditions.push("w.batch_source = ?");
    params.push(filters.batchSource);
  }

  if (filters.startDate) {
    if (columnNames.has("departure_time")) {
      whereConditions.push("(DATE(w.departure_time) >= ? OR w.waybill_date >= ?)");
      params.push(filters.startDate, filters.startDate);
    } else {
      whereConditions.push("w.waybill_date >= ?");
      params.push(filters.startDate);
    }
  }

  if (filters.endDate) {
    if (columnNames.has("departure_time")) {
      whereConditions.push("(DATE(w.departure_time) <= ? OR w.waybill_date <= ?)");
      params.push(filters.endDate, filters.endDate);
    } else {
      whereConditions.push("w.waybill_date <= ?");
      params.push(filters.endDate);
    }
  }

  if (filters.waybillNumber) {
    whereConditions.push("w.waybill_number LIKE ?");
    params.push(`%${filters.waybillNumber}%`);
  }

  if (filters.contractNumber && columnNames.has("contract_number")) {
    whereConditions.push("w.contract_number LIKE ?");
    params.push(`%${filters.contractNumber}%`);
  }

  if (filters.businessMode && columnNames.has("business_mode")) {
    whereConditions.push("w.business_mode = ?");
    params.push(filters.businessMode);
  }

  if (filters.status && columnNames.has("status")) {
    whereConditions.push("w.status = ?");
    params.push(filters.status);
  }

  return {
    fromAndJoinSql: "FROM waybills w LEFT JOIN financiers f ON w.customer_id = f.id",
    whereSql: `WHERE ${whereConditions.join(" AND ")}`,
    params,
  };
}
