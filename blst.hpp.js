// Misc
export var BLST_ERROR;
(function (BLST_ERROR) {
    BLST_ERROR[BLST_ERROR["BLST_SUCCESS"] = 0] = "BLST_SUCCESS";
    BLST_ERROR[BLST_ERROR["BLST_BAD_ENCODING"] = 1] = "BLST_BAD_ENCODING";
    BLST_ERROR[BLST_ERROR["BLST_POINT_NOT_ON_CURVE"] = 2] = "BLST_POINT_NOT_ON_CURVE";
    BLST_ERROR[BLST_ERROR["BLST_POINT_NOT_IN_GROUP"] = 3] = "BLST_POINT_NOT_IN_GROUP";
    BLST_ERROR[BLST_ERROR["BLST_AGGR_TYPE_MISMATCH"] = 4] = "BLST_AGGR_TYPE_MISMATCH";
    BLST_ERROR[BLST_ERROR["BLST_VERIFY_FAIL"] = 5] = "BLST_VERIFY_FAIL";
    BLST_ERROR[BLST_ERROR["BLST_PK_IS_INFINITY"] = 6] = "BLST_PK_IS_INFINITY";
    BLST_ERROR[BLST_ERROR["BLST_BAD_SCALAR"] = 7] = "BLST_BAD_SCALAR";
})(BLST_ERROR || (BLST_ERROR = {}));