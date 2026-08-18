import api from "./api";

const posSupportService = {
  async getTickets() {
    const { data } = await api.get("/pos/support");
    return data;
  },

  async getTicket(ticketId) {
    const { data } = await api.get(`/pos/support/${ticketId}`);
    return data;
  },

  async reply(ticketId, payload) {
    const isFormData = payload instanceof FormData;

    const { data } = await api.post(`/pos/support/${ticketId}/reply`, payload, {
      headers: isFormData ? { "Content-Type": "multipart/form-data" } : {},
    });

    return data;
  },

  async updateStatus(ticketId, payload) {
    const { data } = await api.patch(
      `/pos/support/${ticketId}/status`,
      payload,
    );

    return data;
  },
};

export default posSupportService;
