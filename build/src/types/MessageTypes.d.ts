import { z } from 'zod';
export declare const MessageSchema: z.ZodObject<{
    result_code: z.ZodNumber;
    result_msg: z.ZodOptional<z.ZodString>;
    result_data: z.ZodObject<{
        service: z.ZodString;
    }, z.core.$loose>;
}, z.core.$strip>;
export declare const ConnectSchema: z.ZodObject<{
    service: z.ZodLiteral<"connect">;
    token: z.ZodString;
    uid: z.ZodNumber;
    tips_disable: z.ZodOptional<z.ZodNumber>;
    ip: z.ZodOptional<z.ZodString>;
    virgin_flag: z.ZodOptional<z.ZodNumber>;
    isFirstLogin: z.ZodOptional<z.ZodNumber>;
    forceModifyPasswd: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const LoginSchema: z.ZodObject<{
    service: z.ZodString;
    token: z.ZodString;
    uid: z.ZodNumber;
}, z.core.$strip>;
export declare const DeviceSchema: z.ZodObject<{
    id: z.ZodNumber;
    dev_id: z.ZodNumber;
    dev_code: z.ZodNumber;
    dev_type: z.ZodNumber;
    dev_procotol: z.ZodNumber;
    inv_type: z.ZodNumber;
    optimizer_insert: z.ZodOptional<z.ZodNumber>;
    install_type: z.ZodOptional<z.ZodNumber>;
    dev_opt_total_fault: z.ZodOptional<z.ZodNumber>;
    dev_opt_total_alarm: z.ZodOptional<z.ZodNumber>;
    dev_sn: z.ZodString;
    dev_name: z.ZodString;
    dev_model: z.ZodString;
    port_name: z.ZodString;
    phys_addr: z.ZodString;
    logc_addr: z.ZodString;
    link_status: z.ZodNumber;
    init_status: z.ZodNumber;
    dev_special: z.ZodString;
    list: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
}, z.core.$strip>;
export declare const DeviceListSchema: z.ZodObject<{
    service: z.ZodLiteral<"devicelist">;
    list: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        dev_id: z.ZodNumber;
        dev_code: z.ZodNumber;
        dev_type: z.ZodNumber;
        dev_procotol: z.ZodNumber;
        inv_type: z.ZodNumber;
        optimizer_insert: z.ZodOptional<z.ZodNumber>;
        install_type: z.ZodOptional<z.ZodNumber>;
        dev_opt_total_fault: z.ZodOptional<z.ZodNumber>;
        dev_opt_total_alarm: z.ZodOptional<z.ZodNumber>;
        dev_sn: z.ZodString;
        dev_name: z.ZodString;
        dev_model: z.ZodString;
        port_name: z.ZodString;
        phys_addr: z.ZodString;
        logc_addr: z.ZodString;
        link_status: z.ZodNumber;
        init_status: z.ZodNumber;
        dev_special: z.ZodString;
        list: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    }, z.core.$strip>>;
    count: z.ZodNumber;
}, z.core.$strip>;
export declare const DataSchema: z.ZodObject<{
    data_name: z.ZodString;
    data_value: z.ZodString;
    data_unit: z.ZodString;
}, z.core.$strip>;
export declare const RealtimeSchema: z.ZodObject<{
    service: z.ZodUnion<readonly [z.ZodLiteral<"real">, z.ZodLiteral<"real_battery">]>;
    list: z.ZodArray<z.ZodObject<{
        data_name: z.ZodString;
        data_value: z.ZodString;
        data_unit: z.ZodString;
    }, z.core.$strip>>;
    count: z.ZodNumber;
}, z.core.$strip>;
export declare const DirectItemSchema: z.ZodObject<{
    name: z.ZodString;
    voltage: z.ZodString;
    voltage_unit: z.ZodString;
    current: z.ZodString;
    current_unit: z.ZodString;
}, z.core.$strip>;
export declare const DirectSchema: z.ZodObject<{
    service: z.ZodLiteral<"direct">;
    list: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        voltage: z.ZodString;
        voltage_unit: z.ZodString;
        current: z.ZodString;
        current_unit: z.ZodString;
    }, z.core.$strip>>;
    count: z.ZodNumber;
}, z.core.$strip>;
