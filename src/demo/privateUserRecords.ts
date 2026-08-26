import { DEMO_EMPLOYEES } from "@/demo/employees";

export const PRIVATE_USER_RECORDS = Object.freeze(DEMO_EMPLOYEES.map(({ id, firstName, lastName, address, phone }) => Object.freeze({
  id,
  firstName,
  lastName,
  address,
  phone,
})));
