import { z } from 'zod';
export declare const MessageSchema: z.ZodObject<{
    result_code: z.ZodNumber;
    result_msg: z.ZodOptional<z.ZodString>;
    result_data: z.ZodObject<{
        service: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        service: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        service: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>;
}, "strip", z.ZodTypeAny, {
    result_code: number;
    result_data: {
        service: string;
    } & {
        [k: string]: unknown;
    };
    result_msg?: string | undefined;
}, {
    result_code: number;
    result_data: {
        service: string;
    } & {
        [k: string]: unknown;
    };
    result_msg?: string | undefined;
}>;
export declare const ConnectSchema: z.ZodObject<{
    service: z.ZodLiteral<"connect">;
    token: z.ZodString;
    uid: z.ZodNumber;
    tips_disable: z.ZodOptional<z.ZodNumber>;
    ip: z.ZodOptional<z.ZodString>;
    virgin_flag: z.ZodOptional<z.ZodNumber>;
    isFirstLogin: z.ZodOptional<z.ZodNumber>;
    forceModifyPasswd: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    token: string;
    uid: number;
    service: "connect";
    ip?: string | undefined;
    tips_disable?: number | undefined;
    virgin_flag?: number | undefined;
    isFirstLogin?: number | undefined;
    forceModifyPasswd?: number | undefined;
}, {
    token: string;
    uid: number;
    service: "connect";
    ip?: string | undefined;
    tips_disable?: number | undefined;
    virgin_flag?: number | undefined;
    isFirstLogin?: number | undefined;
    forceModifyPasswd?: number | undefined;
}>;
export declare const LoginSchema: z.ZodObject<{
    service: z.ZodString;
    token: z.ZodString;
    uid: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    token: string;
    uid: number;
    service: string;
}, {
    token: string;
    uid: number;
    service: string;
}>;
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
    list: z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>;
}, "strip", z.ZodTypeAny, {
    id: number;
    dev_id: number;
    dev_code: number;
    dev_type: number;
    dev_procotol: number;
    inv_type: number;
    dev_sn: string;
    dev_name: string;
    dev_model: string;
    port_name: string;
    phys_addr: string;
    logc_addr: string;
    link_status: number;
    init_status: number;
    dev_special: string;
    optimizer_insert?: number | undefined;
    install_type?: number | undefined;
    dev_opt_total_fault?: number | undefined;
    dev_opt_total_alarm?: number | undefined;
    list?: unknown[] | undefined;
}, {
    id: number;
    dev_id: number;
    dev_code: number;
    dev_type: number;
    dev_procotol: number;
    inv_type: number;
    dev_sn: string;
    dev_name: string;
    dev_model: string;
    port_name: string;
    phys_addr: string;
    logc_addr: string;
    link_status: number;
    init_status: number;
    dev_special: string;
    optimizer_insert?: number | undefined;
    install_type?: number | undefined;
    dev_opt_total_fault?: number | undefined;
    dev_opt_total_alarm?: number | undefined;
    list?: unknown[] | undefined;
}>;
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
        list: z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: number;
        dev_id: number;
        dev_code: number;
        dev_type: number;
        dev_procotol: number;
        inv_type: number;
        dev_sn: string;
        dev_name: string;
        dev_model: string;
        port_name: string;
        phys_addr: string;
        logc_addr: string;
        link_status: number;
        init_status: number;
        dev_special: string;
        optimizer_insert?: number | undefined;
        install_type?: number | undefined;
        dev_opt_total_fault?: number | undefined;
        dev_opt_total_alarm?: number | undefined;
        list?: unknown[] | undefined;
    }, {
        id: number;
        dev_id: number;
        dev_code: number;
        dev_type: number;
        dev_procotol: number;
        inv_type: number;
        dev_sn: string;
        dev_name: string;
        dev_model: string;
        port_name: string;
        phys_addr: string;
        logc_addr: string;
        link_status: number;
        init_status: number;
        dev_special: string;
        optimizer_insert?: number | undefined;
        install_type?: number | undefined;
        dev_opt_total_fault?: number | undefined;
        dev_opt_total_alarm?: number | undefined;
        list?: unknown[] | undefined;
    }>, "many">;
    count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    count: number;
    service: "devicelist";
    list: {
        id: number;
        dev_id: number;
        dev_code: number;
        dev_type: number;
        dev_procotol: number;
        inv_type: number;
        dev_sn: string;
        dev_name: string;
        dev_model: string;
        port_name: string;
        phys_addr: string;
        logc_addr: string;
        link_status: number;
        init_status: number;
        dev_special: string;
        optimizer_insert?: number | undefined;
        install_type?: number | undefined;
        dev_opt_total_fault?: number | undefined;
        dev_opt_total_alarm?: number | undefined;
        list?: unknown[] | undefined;
    }[];
}, {
    count: number;
    service: "devicelist";
    list: {
        id: number;
        dev_id: number;
        dev_code: number;
        dev_type: number;
        dev_procotol: number;
        inv_type: number;
        dev_sn: string;
        dev_name: string;
        dev_model: string;
        port_name: string;
        phys_addr: string;
        logc_addr: string;
        link_status: number;
        init_status: number;
        dev_special: string;
        optimizer_insert?: number | undefined;
        install_type?: number | undefined;
        dev_opt_total_fault?: number | undefined;
        dev_opt_total_alarm?: number | undefined;
        list?: unknown[] | undefined;
    }[];
}>;
export declare const DataSchema: z.ZodObject<{
    data_name: z.ZodString;
    data_value: z.ZodString;
    data_unit: z.ZodString;
}, "strip", z.ZodTypeAny, {
    data_name: string;
    data_value: string;
    data_unit: string;
}, {
    data_name: string;
    data_value: string;
    data_unit: string;
}>;
export declare const RealtimeSchema: z.ZodObject<{
    service: z.ZodUnion<[z.ZodLiteral<"real">, z.ZodLiteral<"real_battery">]>;
    list: z.ZodArray<z.ZodObject<{
        data_name: z.ZodString;
        data_value: z.ZodString;
        data_unit: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        data_name: string;
        data_value: string;
        data_unit: string;
    }, {
        data_name: string;
        data_value: string;
        data_unit: string;
    }>, "many">;
    count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    count: number;
    service: "real" | "real_battery";
    list: {
        data_name: string;
        data_value: string;
        data_unit: string;
    }[];
}, {
    count: number;
    service: "real" | "real_battery";
    list: {
        data_name: string;
        data_value: string;
        data_unit: string;
    }[];
}>;
export declare const DirectItemSchema: z.ZodObject<{
    name: z.ZodString;
    voltage: z.ZodString;
    voltage_unit: z.ZodString;
    current: z.ZodString;
    current_unit: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    voltage: string;
    voltage_unit: string;
    current: string;
    current_unit: string;
}, {
    name: string;
    voltage: string;
    voltage_unit: string;
    current: string;
    current_unit: string;
}>;
export declare const DirectSchema: z.ZodObject<{
    service: z.ZodLiteral<"direct">;
    list: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        voltage: z.ZodString;
        voltage_unit: z.ZodString;
        current: z.ZodString;
        current_unit: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        voltage: string;
        voltage_unit: string;
        current: string;
        current_unit: string;
    }, {
        name: string;
        voltage: string;
        voltage_unit: string;
        current: string;
        current_unit: string;
    }>, "many">;
    count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    count: number;
    service: "direct";
    list: {
        name: string;
        voltage: string;
        voltage_unit: string;
        current: string;
        current_unit: string;
    }[];
}, {
    count: number;
    service: "direct";
    list: {
        name: string;
        voltage: string;
        voltage_unit: string;
        current: string;
        current_unit: string;
    }[];
}>;
