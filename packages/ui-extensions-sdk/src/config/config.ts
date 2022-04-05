import { RequestType } from '../constants';
import { Config, ContextClient, LoggerClient, RequestClient } from '../types';

export class DDConfigClient {
    private readonly client: ContextClient & LoggerClient & RequestClient;

    constructor(client: ContextClient & LoggerClient & RequestClient) {
        this.client = client;
    }

    async getConfig(): Promise<Config> {
        return this.client.request(RequestType.GET_CONFIG);
    }
}
