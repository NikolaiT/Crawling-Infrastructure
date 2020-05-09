SSH_KEYFILE=/home/nikolai/.ssh/root_new_server

export $(grep -v '^#' env/production.env | xargs -0);

ssh -i $SSH_KEYFILE root@$MASTER_IP