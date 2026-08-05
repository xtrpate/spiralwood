import api from "./api";

const adminSupportService = {
  async getTickets(params = {}) {
    const { data } = await api.get("/support/tickets", {
      params,
    });

    return data;
  },

  async getTicket(ticketId) {
    const { data } = await api.get(`/support/tickets/${ticketId}`);

    return data;
  },

  async getAssignableUsers() {
    const { data } = await api.get("/support/assignable-users");

    return data;
  },

  async assignTicket(ticketId, assigned_to) {
    const { data } = await api.patch(`/support/tickets/${ticketId}/assign`, {
      assigned_to,
    });

    return data;
  },

  async updateStatus(ticketId, payload) {
    const { data } = await api.patch(
      `/support/tickets/${ticketId}/status`,
      payload,
    );

    return data;
  },

  async reply(ticketId, payload) {
    const { data } = await api.post(
      `/support/tickets/${ticketId}/messages`,
      payload,
    );

    return data;
  },
};

export default adminSupportService;
