SCRIPT=`realpath $0`
SCRIPTPATH=`dirname $SCRIPT`

export $(grep -v '^#' $SCRIPTPATH/env/deploy.env | xargs -0);

ssh -i $PEMFILE $SERVER
