"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DirectSchema = exports.DirectItemSchema = exports.RealtimeSchema = exports.DataSchema = exports.DeviceListSchema = exports.DeviceSchema = exports.LoginSchema = exports.ConnectSchema = exports.MessageSchema = void 0;
const zod_1 = require("zod");
exports.MessageSchema = zod_1.z.object({
    result_code: zod_1.z.number(),
    result_msg: zod_1.z.string().optional(),
    result_data: zod_1.z
        .object({
        service: zod_1.z.string(),
    })
        .passthrough(),
});
exports.ConnectSchema = zod_1.z.object({
    service: zod_1.z.literal('connect'),
    token: zod_1.z.string(),
    uid: zod_1.z.number().int(),
    tips_disable: zod_1.z.number().int().optional(),
    ip: zod_1.z.string().optional(),
    virgin_flag: zod_1.z.number().int().optional(),
    isFirstLogin: zod_1.z.number().int().optional(),
    forceModifyPasswd: zod_1.z.number().int().optional(),
});
exports.LoginSchema = zod_1.z.object({
    service: zod_1.z.string(),
    token: zod_1.z.string(),
    uid: zod_1.z.number().int(),
});
exports.DeviceSchema = zod_1.z.object({
    id: zod_1.z.number().int(),
    dev_id: zod_1.z.number().int(),
    dev_code: zod_1.z.number().int(),
    dev_type: zod_1.z.number().int(),
    dev_procotol: zod_1.z.number().int(),
    inv_type: zod_1.z.number().int(),
    optimizer_insert: zod_1.z.number().int().optional(),
    install_type: zod_1.z.number().int().optional(),
    dev_opt_total_fault: zod_1.z.number().int().optional(),
    dev_opt_total_alarm: zod_1.z.number().int().optional(),
    dev_sn: zod_1.z.string(),
    dev_name: zod_1.z.string(),
    dev_model: zod_1.z.string(),
    port_name: zod_1.z.string(),
    phys_addr: zod_1.z.string(),
    logc_addr: zod_1.z.string(),
    link_status: zod_1.z.number().int(),
    init_status: zod_1.z.number().int(),
    dev_special: zod_1.z.string(),
    list: zod_1.z.array(zod_1.z.unknown()).optional(),
});
exports.DeviceListSchema = zod_1.z.object({
    service: zod_1.z.literal('devicelist'),
    list: zod_1.z.array(exports.DeviceSchema),
    count: zod_1.z.number().int(),
});
exports.DataSchema = zod_1.z.object({
    data_name: zod_1.z.string(),
    data_value: zod_1.z.string(),
    data_unit: zod_1.z.string(),
});
exports.RealtimeSchema = zod_1.z.object({
    service: zod_1.z.union([zod_1.z.literal('real'), zod_1.z.literal('real_battery')]),
    list: zod_1.z.array(exports.DataSchema),
    count: zod_1.z.number().int(),
});
exports.DirectItemSchema = zod_1.z.object({
    name: zod_1.z.string(),
    voltage: zod_1.z.string(),
    voltage_unit: zod_1.z.string(),
    current: zod_1.z.string(),
    current_unit: zod_1.z.string(),
});
exports.DirectSchema = zod_1.z.object({
    service: zod_1.z.literal('direct'),
    list: zod_1.z.array(exports.DirectItemSchema),
    count: zod_1.z.number().int(),
});
//# sourceMappingURL=MessageTypes.js.map